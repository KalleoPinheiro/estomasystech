import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import { ConflictError } from '@/domain/shared/errors';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import {
  reencryptPatientIdentity,
  rewriteLocked,
} from '@/infrastructure/persistence/drizzle/reencrypt-patient-identity';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { BlindIndex } from '@/lib/blind-index';
import { logger } from '@/lib/observability/logger';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';
const OTHER = 'clinic-cpf-b';
const BLIND = new BlindIndex({
  current: 'pepper-de-teste-do-indice-cego-0000000001',
});
const CPF = '52998224725';
const OUTRO_CPF = '11144477735';

describe('Feature: CPF duplicado na mesma clínica bloqueia o cadastro (#738)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let repo: DrizzlePatientRepository;
  let repoOther: DrizzlePatientRepository;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    appDb = db as unknown as AppDb;
    repo = new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER, BLIND);
    repoOther = new DrizzlePatientRepository(appDb, OTHER, TEST_CIPHER, BLIND);
    await db
      .insert(schema.clinics)
      .values({
        id: OTHER,
        name: 'Clínica B',
        createdBy: 'test',
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(schema.patients);
  });

  const paciente = (nome: string, cpf: string | null, phone = '11999990000') =>
    Patient.create({ fullName: nome, phone, cpf });

  const hashOf = async (id: string) =>
    (
      await db
        .select({ cpfHash: schema.patients.cpfHash })
        .from(schema.patients)
        .where(eq(schema.patients.id, id))
    )[0].cpfHash;

  it('Dado CPF já cadastrado na clínica, Quando cadastrar outro paciente com o mesmo CPF, Então recusa com mensagem de negócio', async () => {
    await repo.save(paciente('Ana', CPF));

    const duplicado = repo.save(paciente('Bia', CPF, '11999990001'));

    await expect(duplicado).rejects.toBeInstanceOf(ConflictError);
    await expect(duplicado).rejects.toThrow(
      'Já existe um paciente com este CPF nesta clínica',
    );
    expect(await db.select().from(schema.patients)).toHaveLength(1);
  });

  it('Dado CPF cadastrado em outra clínica, Quando cadastrar na clínica B, Então aceita', async () => {
    await repo.save(paciente('Ana', CPF));

    await expect(
      repoOther.save(paciente('Bia', CPF, '11999990001')),
    ).resolves.toBeUndefined();
  });

  it('Dado paciente com CPF, Quando salvar de novo com o mesmo CPF, Então não conta como duplicado', async () => {
    const ana = paciente('Ana', CPF);
    await repo.save(ana);

    await expect(repo.save(ana)).resolves.toBeUndefined();
  });

  it('Dado paciente, Quando trocar o CPF por um já usado, Então recusa; por um livre, aceita e libera o antigo', async () => {
    const ana = paciente('Ana', CPF);
    const bia = paciente('Bia', OUTRO_CPF, '11999990001');
    await repo.save(ana);
    await repo.save(bia);

    await expect(repo.save(bia.update({ cpf: CPF }))).rejects.toBeInstanceOf(
      ConflictError,
    );

    const livre = '39053344705';
    await repo.save(bia.update({ cpf: livre }));
    await expect(
      repo.save(paciente('Cris', OUTRO_CPF, '11999990002')),
    ).resolves.toBeUndefined();
  });

  it('Dado paciente com CPF, Quando remover o CPF, Então o hash é zerado e o CPF fica livre para outro', async () => {
    const ana = paciente('Ana', CPF);
    await repo.save(ana);
    expect(await hashOf(ana.id)).toMatch(/^b1\./);

    await repo.save(ana.update({ cpf: null }));
    expect(await hashOf(ana.id)).toBeNull();

    await expect(
      repo.save(paciente('Bia', CPF, '11999990001')),
    ).resolves.toBeUndefined();
  });

  it('Dado pacientes sem CPF, Quando cadastrar vários, Então não colidem entre si', async () => {
    await repo.save(paciente('Ana', null));
    await expect(
      repo.save(paciente('Bia', null, '11999990001')),
    ).resolves.toBeUndefined();
  });

  it('Dado erro que não é de CPF duplicado, Quando salvar, Então o erro original sobe', async () => {
    const quebrado = new DrizzlePatientRepository(
      {
        insert: () => ({
          values: () => ({
            onConflictDoUpdate: () => Promise.reject(new Error('rede caiu')),
          }),
        }),
      } as unknown as AppDb,
      CLINIC,
      TEST_CIPHER,
      BLIND,
    );

    await expect(quebrado.save(paciente('Ana', CPF))).rejects.toThrow(
      'rede caiu',
    );
  });

  it('Dado hashes repetidos já gravados, Quando aplicar a migração 0072, Então só o de menor id mantém o hash e o índice é criado', async () => {
    const [limpeza, indice] = readFileSync(
      'drizzle/0072_cpf-unico-por-clinica.sql',
      'utf8',
    ).split('--> statement-breakpoint');
    await db.execute(sql`drop index uq_patients_clinic_cpf_hash`);
    const hash = BLIND.hash(CLINIC, 'cpf', CPF);
    for (const id of ['m2', 'm1']) {
      await db.insert(schema.patients).values({
        id,
        clinicId: CLINIC,
        fullName: TEST_CIPHER.encrypt(id),
        phone: TEST_CIPHER.encrypt('11999990000'),
        cpfHash: hash,
        createdAt: new Date(),
      });
    }

    await db.execute(sql.raw(limpeza));
    await db.execute(sql.raw(indice));

    expect(await hashOf('m1')).toBe(hash);
    expect(await hashOf('m2')).toBeNull();
  });

  describe('backfill com CPF duplicado já gravado (dado legado)', () => {
    const legado = (id: string, nome: string, cpf: string, phone: string) =>
      db.insert(schema.patients).values({
        id,
        clinicId: CLINIC,
        fullName: TEST_CIPHER.encrypt(nome),
        phone: TEST_CIPHER.encrypt(phone),
        cpf: TEST_CIPHER.encrypt(cpf),
        createdAt: new Date(),
      });

    it('Dado dois legados com o mesmo CPF, Quando rodar o backfill, Então o primeiro ganha o hash, o segundo segue sem hash e o resto é regravado', async () => {
      await legado('p1', 'Ana', CPF, '11999990000');
      await legado('p2', 'Ana Duplicada', CPF, '11999990001');
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      const changed = await reencryptPatientIdentity(appDb, TEST_CIPHER, BLIND);

      expect(changed).toBe(2);
      expect(await hashOf('p1')).toMatch(/^b1\./);
      expect(await hashOf('p2')).toBeNull();
      const p2 = (
        await db
          .select()
          .from(schema.patients)
          .where(eq(schema.patients.id, 'p2'))
      )[0];
      expect(p2.phoneHash).toMatch(/^b1\./);
      const avisos = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(avisos).toContain('p2');
      expect(avisos).not.toContain(CPF);
      warn.mockRestore();
    });

    it('Dado duplicado com hash de outro pepper, Quando rodar o backfill, Então o hash antigo é zerado e não aponta o CPF de outro paciente', async () => {
      await legado('p1', 'Ana', CPF, '11999990000');
      const antigo = new BlindIndex({
        current: 'pepper-antigo-do-indice-cego-000000001',
      });
      await db.insert(schema.patients).values({
        id: 'p2',
        clinicId: CLINIC,
        fullName: TEST_CIPHER.encrypt('Bia'),
        phone: TEST_CIPHER.encrypt('11999990001'),
        phoneHash: BLIND.hash(CLINIC, 'phone', '11999990001'),
        cpf: TEST_CIPHER.encrypt(CPF),
        cpfHash: antigo.hash(CLINIC, 'cpf', CPF),
        createdAt: new Date(),
      });
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      await reencryptPatientIdentity(appDb, TEST_CIPHER, BLIND);

      expect(await hashOf('p1')).toMatch(/^b1\./);
      expect(await hashOf('p2')).toBeNull();
      warn.mockRestore();
    });

    it('Dado falha que não é de CPF repetido na gravação, Quando rewriteLocked, Então o erro sobe', async () => {
      await legado('p1', 'Ana', CPF, '11999990000');
      const [row] = await db.select().from(schema.patients);
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({ for: () => Promise.resolve([row]) }),
          }),
        }),
        transaction: () => Promise.reject(new Error('rede caiu')),
      };
      const falho = {
        transaction: (fn: (t: typeof tx) => Promise<boolean>) => fn(tx),
      } as unknown as AppDb;

      await expect(
        rewriteLocked(falho, TEST_CIPHER, BLIND, 'p1'),
      ).rejects.toThrow('rede caiu');
    });

    it('Dado legado duplicado sem mais nada a regravar, Quando rewriteLocked, Então devolve false', async () => {
      await legado('p1', 'Ana', CPF, '11999990000');
      await rewriteLocked(appDb, TEST_CIPHER, BLIND, 'p1');
      await db.insert(schema.patients).values({
        id: 'p2',
        clinicId: CLINIC,
        fullName: TEST_CIPHER.encrypt('Bia'),
        phone: TEST_CIPHER.encrypt('11999990001'),
        cpf: TEST_CIPHER.encrypt(CPF),
        phoneHash: BLIND.hash(CLINIC, 'phone', '11999990001'),
        createdAt: new Date(),
      });
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      expect(await rewriteLocked(appDb, TEST_CIPHER, BLIND, 'p2')).toBe(false);

      warn.mockRestore();
    });
  });
});
