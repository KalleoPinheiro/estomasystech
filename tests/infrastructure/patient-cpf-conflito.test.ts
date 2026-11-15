import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import { ConflictError } from '@/domain/shared/errors';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  CPF_UNIQUE_INDEX,
  DrizzlePatientRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { rewriteLocked } from '@/infrastructure/persistence/drizzle/reencrypt-patient-identity';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { BlindIndex } from '@/lib/blind-index';
import { logger } from '@/lib/observability/logger';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';
const BLIND = new BlindIndex({
  current: 'pepper-de-teste-do-indice-cego-0000000001',
});
const CPF = '52998224725';

/** Erro de unicidade como o driver entrega (código SQLSTATE e nome do índice). */
const violation = (constraint: string) =>
  Object.assign(new Error('duplicate key'), { code: '23505', constraint });

describe('Feature: CPF repetido na clínica vira conflito de negócio (#738)', () => {
  let db: PgliteDatabase<typeof schema>;
  let row: typeof schema.patients.$inferSelect;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    const repo = new DrizzlePatientRepository(
      db as unknown as AppDb,
      CLINIC,
      TEST_CIPHER,
      BLIND,
    );
    await repo.save(
      Patient.create({ fullName: 'Ana', phone: '11999990000', cpf: CPF }),
    );
    [row] = await db.select().from(schema.patients);
  });

  const insertFailing = (error: Error) =>
    ({
      insert: () => ({
        values: () => ({ onConflictDoUpdate: () => Promise.reject(error) }),
      }),
    }) as unknown as AppDb;

  const saveWith = (error: Error) =>
    new DrizzlePatientRepository(
      insertFailing(error),
      CLINIC,
      TEST_CIPHER,
      BLIND,
    ).save(Patient.create({ fullName: 'Bia', phone: '11999990001', cpf: CPF }));

  it('Dado violação do índice de CPF, Quando salvar, Então recusa com mensagem de negócio', async () => {
    const result = saveWith(violation(CPF_UNIQUE_INDEX));

    await expect(result).rejects.toBeInstanceOf(ConflictError);
    await expect(result).rejects.toThrow(
      'Já existe um paciente com este CPF nesta clínica',
    );
  });

  it('Dado violação de outro índice ou falha de rede, Quando salvar, Então o erro original sobe', async () => {
    await expect(saveWith(violation('outro_indice'))).rejects.toThrow(
      'duplicate key',
    );
    await expect(saveWith(new Error('rede caiu'))).rejects.toThrow('rede caiu');
  });

  /** Banco falso: devolve a linha informada e faz o ponto de salvamento falhar. */
  const backfillDb = (
    stored: typeof row,
    savepointError: Error,
  ): { db: AppDb; sets: unknown[] } => {
    const sets: unknown[] = [];
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({ for: () => Promise.resolve([stored]) }),
        }),
      }),
      transaction: () => Promise.reject(savepointError),
      update: () => ({
        set: (values: unknown) => {
          sets.push(values);
          return { where: () => Promise.resolve() };
        },
      }),
    };
    return {
      sets,
      db: {
        transaction: (fn: (t: typeof tx) => Promise<boolean>) => fn(tx),
      } as unknown as AppDb,
    };
  };

  it('Dado colisão de CPF e nada mais a regravar, Quando o hash guardado já é nulo, Então não grava', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { db: fake, sets } = backfillDb(
      { ...row, cpfHash: null },
      violation(CPF_UNIQUE_INDEX),
    );

    expect(await rewriteLocked(fake, TEST_CIPHER, BLIND, row.id)).toBe(false);

    expect(sets).toEqual([]);
    expect(warn.mock.calls.join(' ')).toContain(row.id);
    expect(warn.mock.calls.join(' ')).not.toContain(CPF);
    warn.mockRestore();
  });

  it('Dado colisão de CPF e hash antigo guardado, Quando rodar, Então zera o hash antigo', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { db: fake, sets } = backfillDb(
      { ...row, cpfHash: 'b1.antigo.0000' },
      violation(CPF_UNIQUE_INDEX),
    );

    expect(await rewriteLocked(fake, TEST_CIPHER, BLIND, row.id)).toBe(true);

    expect(sets).toEqual([{ cpfHash: null }]);
    warn.mockRestore();
  });

  it('Dado colisão de CPF com outros campos a regravar, Quando rodar, Então regrava o resto sem o hash do CPF', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { db: fake, sets } = backfillDb(
      { ...row, fullName: 'Ana', cpfHash: null },
      violation(CPF_UNIQUE_INDEX),
    );

    expect(await rewriteLocked(fake, TEST_CIPHER, BLIND, row.id)).toBe(true);

    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ cpfHash: null });
    expect(Object.keys(sets[0] as object)).toContain('fullName');
    warn.mockRestore();
  });

  it('Dado falha que não é do índice de CPF, Quando rodar o backfill, Então o erro sobe', async () => {
    const { db: fake } = backfillDb(
      { ...row, cpfHash: null },
      new Error('rede caiu'),
    );

    await expect(
      rewriteLocked(fake, TEST_CIPHER, BLIND, row.id),
    ).rejects.toThrow('rede caiu');
  });
});
