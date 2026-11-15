import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Guardian } from '@/domain/guardian/guardian';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  DrizzleGuardianRepository,
  GUARDIAN_SCAN_CAP,
} from '@/infrastructure/persistence/drizzle/drizzle-guardian-repository';
import {
  reencryptGuardianIdentity,
  rewriteGuardianLocked,
} from '@/infrastructure/persistence/drizzle/reencrypt-guardian-identity';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { BlindIndex } from '@/lib/blind-index';
import { logger } from '@/lib/observability/logger';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';
const BLIND = new BlindIndex({
  current: 'pepper-de-teste-do-indice-cego-0000000001',
});

describe('Feature: PII do responsável cifrada em repouso (ADR-096, #739)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let repo: DrizzleGuardianRepository;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    appDb = db as unknown as AppDb;
    repo = new DrizzleGuardianRepository(appDb, CLINIC, TEST_CIPHER, BLIND);
  });

  beforeEach(async () => {
    await db.update(schema.patients).set({ guardianId: null });
    await db.delete(schema.guardians);
  });

  const guardian = (nome: string, phone = '11999990000', email?: string) =>
    Guardian.create({
      fullName: nome,
      relationship: 'mae',
      phone,
      email: email ?? null,
    });

  const raw = async (id: string) =>
    (
      await db
        .select()
        .from(schema.guardians)
        .where(eq(schema.guardians.id, id))
    )[0];

  const legado = (id: string, nome: string, phone: string, email?: string) =>
    db.insert(schema.guardians).values({
      id,
      clinicId: CLINIC,
      fullName: nome,
      relationship: 'mae',
      phone,
      email: email ?? null,
      createdAt: new Date(),
    });

  it('Dado responsável salvo, Quando ler a tabela, Então nome, telefone e e-mail estão cifrados e o índice cego preenchido', async () => {
    const maria = guardian('Maria Souza', '11999990000', 'maria@x.com');
    await repo.save(maria);

    const row = await raw(maria.id);

    expect(row.fullName).not.toContain('Maria');
    expect(row.phone).not.toContain('99999');
    expect(row.email).not.toContain('maria');
    expect(row.phoneHash).toMatch(/^b1\./);
    expect(row.emailHash).toMatch(/^b1\./);
    expect(await repo.findById(maria.id)).toMatchObject({
      fullName: 'Maria Souza',
      phone: '+5511999990000',
      email: 'maria@x.com',
    });
  });

  it('Dado responsável sem e-mail, Quando salvar, Então o hash do e-mail fica nulo', async () => {
    const ana = guardian('Ana Lima');
    await repo.save(ana);

    expect((await raw(ana.id)).emailHash).toBeNull();
    expect((await repo.findById(ana.id))?.email).toBeNull();
  });

  it('Dado índice cego entregue por função, Quando salvar, Então resolve só no uso', async () => {
    const lazy = new DrizzleGuardianRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
      () => BLIND,
    );
    const g = guardian('Fabi Preguiçosa');
    await lazy.save(g);

    expect((await raw(g.id)).phoneHash).toMatch(/^b1\./);
  });

  describe('busca', () => {
    it('acha por nome sem acento nem caixa, por telefone e e-mail exatos, e sem termo lista tudo por nome', async () => {
      const zeca = guardian('Zeca Álvares', '11988880001', 'zeca@x.com');
      const abel = guardian('Abel Costa', '11988880002');
      await repo.save(zeca);
      await repo.save(abel);

      expect((await repo.findAll('ALVARES')).map((g) => g.id)).toEqual([
        zeca.id,
      ]);
      expect((await repo.findAll('(11) 98888-0002')).map((g) => g.id)).toEqual([
        abel.id,
      ]);
      expect((await repo.findAll('ZECA@x.com')).map((g) => g.id)).toEqual([
        zeca.id,
      ]);
      expect((await repo.findAll()).map((g) => g.id)).toEqual([
        abel.id,
        zeca.id,
      ]);
      expect(await repo.findAll('zeca@x')).toEqual([]);
      expect(await repo.findAll('00000000')).toEqual([]);
    });

    it('linha legada sem hash ainda é achada por telefone e e-mail exatos', async () => {
      await legado('leg-1', 'Legada', '+5511955554444', 'leg@x.com');

      expect((await repo.findAll('(11) 95555-4444')).map((g) => g.id)).toEqual([
        'leg-1',
      ]);
      expect((await repo.findAll('LEG@x.com')).map((g) => g.id)).toEqual([
        'leg-1',
      ]);
      expect(await repo.findAll('(11) 95555-0000')).toEqual([]);
    });

    it('escopo de sistema não acha por valor exato (sem empresa para o hash)', async () => {
      await repo.save(guardian('Visível', '11977770000'));
      const system = new DrizzleGuardianRepository(
        appDb,
        null,
        TEST_CIPHER,
        BLIND,
      );

      expect(await system.findAll('(11) 97777-0000')).toEqual([]);
      expect((await system.findAll('visivel')).length).toBe(1);
    });

    it('acima do teto avisa sem dado pessoal e trunca', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const rows = Array.from({ length: GUARDIAN_SCAN_CAP + 1 }, (_, i) => ({
        id: `g-${i}`,
        fullName: TEST_CIPHER.encrypt('Fulana'),
      }));
      const fake = {
        select: () => ({
          from: () => ({
            where: () =>
              Object.assign(Promise.resolve([]), {
                orderBy: () => ({ limit: () => Promise.resolve(rows) }),
              }),
          }),
        }),
      } as unknown as AppDb;

      await new DrizzleGuardianRepository(
        fake,
        CLINIC,
        TEST_CIPHER,
        BLIND,
      ).findAll();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('busca truncada'),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain('Fulana');
      warn.mockRestore();
    });

    it('linha removida entre a seleção e a carga é ignorada', async () => {
      const loaded = await (
        repo as unknown as { loadInOrder(ids: string[]): Promise<unknown[]> }
      ).loadInOrder(['fantasma']);
      expect(loaded).toEqual([]);
    });
  });

  describe('backfill (data:reencrypt)', () => {
    it('cifra o que estava em claro, preenche o índice cego e a segunda rodada não muda nada', async () => {
      await legado('b-1', 'Bia Legada', '+5511966660000', 'bia@x.com');
      await legado('b-2', 'Cris Sem Email', '+5511966660001');
      await repo.save(guardian('Dora Já Cifrada', '11966660002'));

      const changed = await reencryptGuardianIdentity(
        appDb,
        TEST_CIPHER,
        BLIND,
      );

      expect(changed).toBe(2);
      const row = await raw('b-1');
      expect(row.fullName).not.toContain('Bia');
      expect(row.phone).not.toContain('6666');
      expect(row.email).not.toContain('bia');
      expect(row.phoneHash).toMatch(/^b1\./);
      expect(row.emailHash).toMatch(/^b1\./);
      expect((await raw('b-2')).emailHash).toBeNull();
      expect((await repo.findById('b-1'))?.fullName).toBe('Bia Legada');
      expect(await reencryptGuardianIdentity(appDb, TEST_CIPHER, BLIND)).toBe(
        0,
      );
    });

    it('hash de outro pepper é recalculado', async () => {
      const g = guardian('Eva', '11966660003');
      await repo.save(g);
      const antigo = new BlindIndex({
        current: 'pepper-antigo-do-indice-cego-000000001',
      });
      await db
        .update(schema.guardians)
        .set({ phoneHash: antigo.hash(CLINIC, 'phone', '11966660003') })
        .where(eq(schema.guardians.id, g.id));

      expect(await rewriteGuardianLocked(appDb, TEST_CIPHER, BLIND, g.id)).toBe(
        true,
      );
      expect((await raw(g.id)).phoneHash).toBe(
        BLIND.hash(CLINIC, 'phone', '11966660003'),
      );
    });

    it('responsável removido entre o lote e a trava é ignorado', async () => {
      expect(
        await rewriteGuardianLocked(appDb, TEST_CIPHER, BLIND, 'sumiu'),
      ).toBe(false);
    });
  });
});
