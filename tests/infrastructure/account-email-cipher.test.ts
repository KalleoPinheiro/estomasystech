import { eq, sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { newId } from '@/domain/shared/id';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleUserAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import { listOrphanPortalAccounts } from '@/infrastructure/persistence/drizzle/portal-orphans';
import {
  reencryptAccountIdentity,
  rewriteAccountLocked,
} from '@/infrastructure/persistence/drizzle/reencrypt-account-identity';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { BlindIndex, LOGIN_INDEX_SCOPE } from '@/lib/blind-index';
import { isUniqueViolation } from '@/lib/db-errors';
import { logger } from '@/lib/observability/logger';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';
const OTHER = 'conta-email-outra-clinica';
const BLIND = new BlindIndex({
  current: 'pepper-de-teste-do-indice-cego-0000000001',
});
const HASH = 'scrypt$1$salt$hash';

describe('Feature: e-mail de login cifrado em repouso com índice cego (ADR-111, #742)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let repo: DrizzleUserAccountRepository;
  let system: DrizzleUserAccountRepository;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    appDb = db as unknown as AppDb;
    repo = new DrizzleUserAccountRepository(appDb, CLINIC, TEST_CIPHER, BLIND);
    system = new DrizzleUserAccountRepository(
      appDb,
      null,
      TEST_CIPHER,
      () => BLIND,
    );
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
    await db.delete(schema.userAccounts);
  });

  const account = (email: string, clinicId: string | null = CLINIC) =>
    UserAccount.create({
      email,
      passwordHash: HASH,
      role: clinicId === null ? 'super_admin' : 'atendente',
      clinicId,
    });

  const raw = async (id: string) =>
    (
      await db
        .select()
        .from(schema.userAccounts)
        .where(eq(schema.userAccounts.id, id))
    )[0];

  /** Linha como estava antes da conversão: e-mail em claro e sem índice cego. */
  const legado = async (
    email: string,
    clinicId: string | null = CLINIC,
    extra: Partial<typeof schema.userAccounts.$inferInsert> = {},
  ) => {
    // Estado anterior à conversão (#909): conta ativa sem hash; derruba a restrição, se já existir.
    await db.execute(
      sql`ALTER TABLE user_accounts DROP CONSTRAINT IF EXISTS ck_user_accounts_email_hash_conta_ativa`,
    );
    const id = newId();
    await db.insert(schema.userAccounts).values({
      id,
      clinicId,
      email,
      passwordHash: HASH,
      role: clinicId === null ? 'super_admin' : 'atendente',
      createdAt: new Date(),
      ...extra,
    });
    return id;
  };

  describe('gravação e leitura', () => {
    it('Dada uma conta salva, Quando ler a tabela, Então o e-mail está cifrado e o índice cego preenchido', async () => {
      const ana = account('ana@clinica.test');
      await repo.save(ana);

      const row = await raw(ana.id);

      expect(row.email).not.toContain('ana@');
      expect(row.email).toMatch(/^v1\./);
      expect(row.emailHash).toMatch(/^b1\./);
      expect(row.emailHash).not.toContain('ana');
      expect((await repo.findById(ana.id))?.email).toBe('ana@clinica.test');
    });

    it('Dado o e-mail digitado com caixa e espaços, Quando buscar, Então acha a conta pelo índice cego', async () => {
      const ana = account('ana@clinica.test');
      await repo.save(ana);

      expect((await repo.findByEmail('  ANA@Clinica.test '))?.id).toBe(ana.id);
      expect(await repo.findByEmail('outra@clinica.test')).toBeNull();
      expect(
        (await repo.findAllByEmail('ana@clinica.test')).map((a) => a.id),
      ).toEqual([ana.id]);
    });

    it('Dado e-mail que não é e-mail, Quando buscar, Então não acha e não lança', async () => {
      await repo.save(account('ana@clinica.test'));

      expect(await repo.findByEmail('isto não é e-mail')).toBeNull();
      expect(await repo.findAllByEmail('')).toEqual([]);
    });

    it('Dado o mesmo e-mail em duas empresas, Quando o login (escopo de sistema) busca, Então acha as duas contas; o repositório da empresa só a sua', async () => {
      const a = account('dupla@clinica.test');
      const b = account('dupla@clinica.test', OTHER);
      await repo.save(a);
      await new DrizzleUserAccountRepository(
        appDb,
        OTHER,
        TEST_CIPHER,
        BLIND,
      ).save(b);

      const found = await system.findAllByEmail('dupla@clinica.test');

      expect(found.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
      expect(
        (await repo.findAllByEmail('dupla@clinica.test')).map((x) => x.id),
      ).toEqual([a.id]);
    });

    it('Dado o super_admin, Quando salvar e buscar, Então o hash usa o escopo global e a conta é achada', async () => {
      const root = account('root@plataforma.test', null);
      await system.save(root);

      const row = await raw(root.id);

      expect(row.clinicId).toBeNull();
      expect(row.email).toMatch(/^v1\./);
      expect(row.emailHash).toBe(
        BLIND.hash(LOGIN_INDEX_SCOPE, 'login-email', 'root@plataforma.test'),
      );
      expect((await system.findByEmail('root@plataforma.test'))?.id).toBe(
        root.id,
      );
      expect((await system.findSystemAccount())?.email).toBe(
        'root@plataforma.test',
      );
    });
  });

  describe('unicidade pelo índice cego', () => {
    it('Dado e-mail repetido na mesma empresa, Quando salvar outra conta, Então o banco barra', async () => {
      await repo.save(account('unico@clinica.test'));

      const error = await repo
        .save(account('Unico@Clinica.test'))
        .catch((e: unknown) => e);

      expect(
        isUniqueViolation(error, 'uq_user_accounts_clinic_email_hash'),
      ).toBe(true);
    });

    it('Dado o mesmo e-mail em outra empresa, Quando salvar, Então permite', async () => {
      await repo.save(account('livre@clinica.test'));

      await expect(
        new DrizzleUserAccountRepository(appDb, OTHER, TEST_CIPHER, BLIND).save(
          account('livre@clinica.test', OTHER),
        ),
      ).resolves.toBeUndefined();
    });

    it('Dados dois super_admin com o mesmo e-mail, Quando salvar o segundo, Então o banco barra', async () => {
      await db.insert(schema.userAccounts).values({
        id: 'sa-existente',
        clinicId: null,
        email: 'x',
        emailHash: BLIND.hash(
          LOGIN_INDEX_SCOPE,
          'login-email',
          'root@plataforma.test',
        ),
        passwordHash: HASH,
        role: 'super_admin',
        createdAt: new Date(),
      });

      const error = await db
        .insert(schema.userAccounts)
        .values({
          id: 'sa-outro',
          clinicId: null,
          email: 'y',
          emailHash: BLIND.hash(
            LOGIN_INDEX_SCOPE,
            'login-email',
            'root@plataforma.test',
          ),
          passwordHash: HASH,
          role: 'super_admin',
          createdAt: new Date(),
        })
        .catch((e: unknown) => e);

      expect(
        isUniqueViolation(error, 'uq_user_accounts_super_admin_email_hash') ||
          isUniqueViolation(error, 'uq_user_accounts_single_system_account'),
      ).toBe(true);
    });
  });

  describe('janela até a conversão', () => {
    it('Dada conta antiga em claro e sem hash, Quando buscar, Então o login ainda acha e lê o e-mail', async () => {
      const id = await legado('antiga@clinica.test');

      expect((await repo.findByEmail('antiga@clinica.test'))?.id).toBe(id);
      expect(
        (await system.findAllByEmail('Antiga@clinica.test')).map((a) => a.id),
      ).toEqual([id]);
      expect((await repo.findById(id))?.email).toBe('antiga@clinica.test');
    });
  });

  describe('rotação do pepper', () => {
    it('Dado hash gravado com o pepper anterior, Quando buscar com o novo, Então ainda acha', async () => {
      const antigo = new BlindIndex({
        current: 'pepper-antigo-do-indice-cego-00000000001',
      });
      const ana = account('rotacao@clinica.test');
      await new DrizzleUserAccountRepository(
        appDb,
        CLINIC,
        TEST_CIPHER,
        antigo,
      ).save(ana);
      const novo = new BlindIndex({
        current: 'pepper-novo-do-indice-cego-0000000000001',
        previous: ['pepper-antigo-do-indice-cego-00000000001'],
      });

      const found = await new DrizzleUserAccountRepository(
        appDb,
        CLINIC,
        TEST_CIPHER,
        novo,
      ).findByEmail('rotacao@clinica.test');

      expect(found?.id).toBe(ana.id);
      expect(await reencryptAccountIdentity(appDb, TEST_CIPHER, novo)).toBe(1);
      expect((await raw(ana.id)).emailHash).toBe(
        novo.hash(LOGIN_INDEX_SCOPE, 'login-email', 'rotacao@clinica.test'),
      );
    });
  });

  describe('listagens ordenadas em memória', () => {
    it('Dadas contas cifradas, Quando listar, Então a ordem é por e-mail legível', async () => {
      await repo.save(account('carla@clinica.test'));
      await repo.save(account('ana@clinica.test'));
      await repo.save(account('bia@clinica.test'));

      const emails = (accounts: UserAccount[]) => accounts.map((a) => a.email);

      expect(emails(await repo.findAll())).toEqual([
        'ana@clinica.test',
        'bia@clinica.test',
        'carla@clinica.test',
      ]);
      expect(emails(await repo.findByRole('atendente'))).toEqual([
        'ana@clinica.test',
        'bia@clinica.test',
        'carla@clinica.test',
      ]);
      expect(
        emails(
          await appDb.transaction((tx) =>
            new DrizzleUserAccountRepository(
              tx as unknown as AppDb,
              CLINIC,
              TEST_CIPHER,
              BLIND,
            ).findByRoleForUpdate('atendente'),
          ),
        ),
      ).toEqual(['ana@clinica.test', 'bia@clinica.test', 'carla@clinica.test']);
    });

    it('Dado e-mail repetido entre empresas, Quando listar tudo pelo sistema, Então mantém os dois sem erro de ordem', async () => {
      await repo.save(account('mesmo@clinica.test'));
      await new DrizzleUserAccountRepository(
        appDb,
        OTHER,
        TEST_CIPHER,
        BLIND,
      ).save(account('mesmo@clinica.test', OTHER));

      expect(await system.findAll()).toHaveLength(2);
    });
  });

  describe('contas de portal sem vínculo', () => {
    it('Dadas contas cifradas, Quando listar, Então o e-mail volta legível e ordenado por empresa e e-mail', async () => {
      const portal = (email: string, clinicId: string) =>
        UserAccount.create({
          email,
          passwordHash: HASH,
          role: 'patient',
          clinicId,
        });
      const b = portal('b@portal.test', CLINIC);
      const a = portal('a@portal.test', CLINIC);
      await repo.save(b);
      await repo.save(a);

      const orphans = await listOrphanPortalAccounts(appDb, TEST_CIPHER);

      expect(orphans.map((o) => o.email)).toEqual([
        'a@portal.test',
        'b@portal.test',
      ]);
    });
  });

  describe('conversão (data:reencrypt)', () => {
    it('Dada conta em claro, Quando converter, Então cifra, preenche o hash e a segunda rodada não muda nada', async () => {
      const id = await legado('converte@clinica.test');

      expect(await reencryptAccountIdentity(appDb, TEST_CIPHER, BLIND)).toBe(1);
      const row = await raw(id);
      expect(row.email).toMatch(/^v1\./);
      expect(row.emailHash).toBe(
        BLIND.hash(LOGIN_INDEX_SCOPE, 'login-email', 'converte@clinica.test'),
      );
      expect((await repo.findByEmail('converte@clinica.test'))?.id).toBe(id);

      expect(await reencryptAccountIdentity(appDb, TEST_CIPHER, BLIND)).toBe(0);
    });

    it('Dado o super_admin em claro, Quando converter, Então o hash é global e o login acha', async () => {
      const id = await legado('root@plataforma.test', null);

      expect(await reencryptAccountIdentity(appDb, TEST_CIPHER, BLIND)).toBe(1);

      expect((await raw(id)).emailHash).toMatch(/^b1\./);
      expect((await system.findByEmail('root@plataforma.test'))?.id).toBe(id);
    });

    it('Dada conta já cifrada sem hash, Quando converter, Então só preenche o hash', async () => {
      const id = await legado('semhash@clinica.test', CLINIC, {
        email: TEST_CIPHER.encrypt('semhash@clinica.test'),
      });
      const before = (await raw(id)).email;

      expect(await reencryptAccountIdentity(appDb, TEST_CIPHER, BLIND)).toBe(1);

      expect((await raw(id)).email).toBe(before);
      expect((await raw(id)).emailHash).toMatch(/^b1\./);
    });

    it('Dada conta anonimizada, Quando converter, Então não toca na linha', async () => {
      const id = await legado('anonimizado+x@anonimizado.invalid', CLINIC, {
        anonymizedAt: new Date(),
        active: false,
      });

      expect(await reencryptAccountIdentity(appDb, TEST_CIPHER, BLIND)).toBe(0);

      const row = await raw(id);
      expect(row.email).toBe('anonimizado+x@anonimizado.invalid');
      expect(row.emailHash).toBeNull();
    });

    it('Dado e-mail que não normaliza, Quando converter, Então deixa a linha como está e avisa só o id', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const id = await legado('sem-formato-de-email');

      expect(await reencryptAccountIdentity(appDb, TEST_CIPHER, BLIND)).toBe(0);

      expect((await raw(id)).email).toBe('sem-formato-de-email');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(id));
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('sem-formato-de-email'),
      );
      warn.mockRestore();
    });

    it('Dado id que não existe, Quando regravar com trava, Então devolve falso', async () => {
      expect(
        await rewriteAccountLocked(appDb, TEST_CIPHER, BLIND, 'nao-existe'),
      ).toBe(false);
    });

    it('Dadas mais contas que um lote, Quando converter, Então percorre todas', async () => {
      for (let i = 0; i < 205; i += 1) {
        await legado(`lote${i}@clinica.test`);
      }

      expect(await reencryptAccountIdentity(appDb, TEST_CIPHER, BLIND)).toBe(
        205,
      );
      expect(await reencryptAccountIdentity(appDb, TEST_CIPHER, BLIND)).toBe(0);
    });
  });

  describe('chaves do ambiente', () => {
    it('Dado repositório sem cifra nem índice informados, Quando salvar e buscar, Então usa o ambiente', async () => {
      const envRepo = new DrizzleUserAccountRepository(appDb, CLINIC);
      const ana = account('ambiente@clinica.test');

      await envRepo.save(ana);

      expect((await raw(ana.id)).email).toMatch(/^v1\./);
      expect((await envRepo.findByEmail('ambiente@clinica.test'))?.id).toBe(
        ana.id,
      );
    });
  });
});
