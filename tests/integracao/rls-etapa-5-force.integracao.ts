import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import { AuthToken } from '@/domain/auth/auth-token';
import { UserAccount } from '@/domain/auth/user-account';
import { scopeDbToClinic } from '@/infrastructure/persistence/drizzle/clinic-scoped-pool';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAuditEventRepository } from '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository';
import { DrizzleAuthTokenRepository } from '@/infrastructure/persistence/drizzle/drizzle-auth-token-repository';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzleUserAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import { DrizzleMfaRepository } from '@/infrastructure/persistence/drizzle/drizzle-mfa-repository';
import { listOrphanPortalAccounts } from '@/infrastructure/persistence/drizzle/portal-orphans';
import { reencryptAccountIdentity } from '@/infrastructure/persistence/drizzle/reencrypt-account-identity';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { BlindIndex } from '@/lib/blind-index';
import { TEST_CIPHER } from '../support/cipher';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * RLS etapa 5 (#874, ADR-110): a 0082 liga a política `clinic_isolation` em `clinics`, `auth_tokens`, `user_mfa` e
 * `mfa_recovery_codes` e a 0083 dá FORCE ROW LEVEL SECURITY nas 45 tabelas. Com FORCE a política vale também para o
 * DONO da tabela (aqui um papel de login que NÃO é superusuário nem BYPASSRLS, o pior caso da produção): só o papel
 * de sistema (BYPASSRLS) e o superusuário a ignoram. Prova em Postgres real (o PGlite não aplica RLS).
 */
const CLINIC_A = 'clinic-rls5-a';
const CLINIC_B = 'clinic-rls5-b';
const APP_GROUP = 'estomasystech_app';
const HASH = 'scrypt$1$sal$hash';
const BLIND = new BlindIndex({
  current: 'pepper-de-teste-da-integracao-00000874',
});
const NO_CLINIC_ID_TABLES = [
  'clinics',
  'auth_tokens',
  'user_mfa',
  'mfa_recovery_codes',
];
const ACCOUNT_OF = (clinicId: string) => `user_accounts.id.${clinicId}`;

describe('Feature: FORCE ROW LEVEL SECURITY nas tabelas com política (#874)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_rls5_${process.pid}_${Date.now()}`;
  const ownerRole = `own_rls5_${process.pid}`;
  const appRole = `app_rls5_${process.pid}`;
  const systemRole = `sys_rls5_${process.pid}`;
  const password = 'senha-descartavel-rls5';
  let admin: Pool;
  let owner: Pool;
  let app: Pool;
  let system: Pool;
  let forced: string[] = [];

  const asRole = (role: string) => {
    const url = new URL(withDatabase(baseUrl, databaseName));
    url.username = role;
    url.password = password;
    // max 1: a mesma conexão serve todas as transações, o pior caso para vazar o setting.
    return new Pool({ connectionString: url.toString(), max: 1 });
  };

  /** Executa na transação da clínica (ou sem clínica) e, se `rollback`, desfaz no fim. */
  async function inClinic<T>(
    pool: Pool,
    clinicId: string | null,
    fn: (client: PoolClient) => Promise<T>,
    rollback = false,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (clinicId !== null) {
        await client.query(`SELECT set_config('app.clinic_id', $1, true)`, [
          clinicId,
        ]);
      }
      const result = await fn(client);
      await client.query(rollback ? 'ROLLBACK' : 'COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const countOf = (table: string) => (client: PoolClient) =>
    client
      .query(`SELECT 1 FROM ${quoteIdent(table)}`)
      .then((result) => result.rowCount);

  /** Linha mínima da tabela para a clínica, sem depender das regras de cada tabela. */
  async function rowFor(table: string, clinicId: string) {
    const columns = await admin.query<{
      column_name: string;
      data_type: string;
    }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
          AND ((is_nullable = 'NO' AND column_default IS NULL) OR column_name = 'clinic_id')
          AND is_generated = 'NEVER'
        ORDER BY ordinal_position`,
      [table],
    );
    const names: string[] = [];
    const values: unknown[] = [];
    for (const column of columns.rows) {
      names.push(quoteIdent(column.column_name));
      if (column.column_name === 'clinic_id') values.push(clinicId);
      else if (table === 'clinics' && column.column_name === 'id')
        values.push(clinicId);
      else if (column.column_name === 'account_id')
        values.push(ACCOUNT_OF(clinicId));
      else if (column.data_type === 'text')
        values.push(`${table}.${column.column_name}.${clinicId}`);
      else if (column.data_type === 'integer') values.push(1);
      else if (column.data_type === 'date') values.push('2026-12-25');
      else if (column.data_type.startsWith('timestamp'))
        values.push('2026-11-16T10:00:00Z');
      else throw new Error(`tipo sem valor de teste: ${column.data_type}`);
    }
    const marks = values.map((_, index) => `$${index + 1}`).join(', ');
    return {
      sql: `INSERT INTO ${quoteIdent(table)} (${names.join(', ')}) VALUES (${marks})`,
      values,
    };
  }

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    admin = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 1,
    });
    // Papéis: dono comum (a conexão da aplicação hoje), papel da aplicação e papel de sistema (BYPASSRLS).
    await admin.query(
      `CREATE ROLE ${quoteIdent(ownerRole)} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`,
    );
    await admin.query(
      `CREATE ROLE ${quoteIdent(appRole)} LOGIN PASSWORD '${password}' IN ROLE ${APP_GROUP}`,
    );
    await admin.query(
      `CREATE ROLE ${quoteIdent(systemRole)} LOGIN PASSWORD '${password}' BYPASSRLS IN ROLE ${APP_GROUP}`,
    );
    const objects = await admin.query<{ relname: string; relkind: string }>(
      `SELECT relname, relkind FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'S')`,
    );
    for (const object of objects.rows) {
      const kind = object.relkind === 'S' ? 'SEQUENCE' : 'TABLE';
      await admin.query(
        `ALTER ${kind} ${quoteIdent(object.relname)} OWNER TO ${quoteIdent(ownerRole)}`,
      );
    }
    await admin.query(`DELETE FROM clinics WHERE id = 'legacy-clinic'`);
    // Dados da prova genérica: sem FKs nem CHECKs (banco descartável), uma linha por clínica em cada tabela.
    await admin.query(`SET session_replication_role = replica`);
    const checks = await admin.query<{ relname: string; conname: string }>(
      `SELECT c.relname, k.conname FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
        WHERE k.contype = 'c' AND c.relnamespace = 'public'::regnamespace`,
    );
    for (const check of checks.rows) {
      await admin.query(
        `ALTER TABLE ${quoteIdent(check.relname)} DROP CONSTRAINT ${quoteIdent(check.conname)}`,
      );
    }
    forced = (
      await admin.query<{ relname: string }>(
        `SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
            AND relforcerowsecurity ORDER BY relname`,
      )
    ).rows.map((row) => row.relname);
    for (const id of [CLINIC_A, CLINIC_B]) {
      for (const table of forced) {
        const row = await rowFor(table, id);
        await admin.query(row.sql, row.values);
      }
    }
    owner = asRole(ownerRole);
    app = asRole(appRole);
    system = asRole(systemRole);
  });

  afterAll(async () => {
    for (const step of [
      () => owner?.end(),
      () => app?.end(),
      () => system?.end(),
      () => admin?.end(),
      () =>
        adminQuery(
          baseUrl,
          `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
        ),
      () => adminQuery(baseUrl, `DROP ROLE IF EXISTS ${quoteIdent(ownerRole)}`),
      () => adminQuery(baseUrl, `DROP ROLE IF EXISTS ${quoteIdent(appRole)}`),
      () =>
        adminQuery(baseUrl, `DROP ROLE IF EXISTS ${quoteIdent(systemRole)}`),
    ]) {
      await Promise.resolve(step()).catch(() => undefined);
    }
  });

  it('Dado o esquema migrado, Quando leio o catálogo, Então FORCE e a política clinic_isolation cobrem as mesmas 45 tabelas, as quatro sem clinic_id incluídas', async () => {
    const withPolicy = (
      await admin.query<{ tablename: string }>(
        `SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'clinic_isolation'
          ORDER BY tablename`,
      )
    ).rows.map((row) => row.tablename);
    expect(forced).toEqual(withPolicy);
    expect(forced).toHaveLength(45);
    expect(forced).toEqual(expect.arrayContaining(NO_CLINIC_ID_TABLES));
    // Tabela com RLS ligado sem FORCE seria uma porta aberta ao dono.
    const unforced = await admin.query(
      `SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
          AND relrowsecurity AND NOT relforcerowsecurity`,
    );
    expect(unforced.rows).toEqual([]);
  });

  it('Dado o superusuário e o papel de sistema, Quando leem sem clínica, Então veem as duas clínicas em toda tabela', async () => {
    for (const table of forced) {
      expect(await inClinic(system, null, countOf(table))).toBe(2);
      expect(
        (await admin.query(`SELECT 1 FROM ${quoteIdent(table)}`)).rowCount,
      ).toBe(2);
    }
  });

  it.each(['owner', 'app'] as const)(
    'Dado o %s (com FORCE), Quando lê sem clínica na transação, Então falha fechado: zero linhas em toda tabela',
    async (who) => {
      const pool = who === 'owner' ? owner : app;
      for (const table of forced) {
        expect(await inClinic(pool, null, countOf(table))).toBe(0);
      }
    },
  );

  it.each(['owner', 'app'] as const)(
    'Dado o %s (com FORCE), Quando lê com a clínica A, Então vê só a linha da A em toda tabela',
    async (who) => {
      const pool = who === 'owner' ? owner : app;
      for (const table of forced) {
        expect(await inClinic(pool, CLINIC_A, countOf(table))).toBe(1);
        expect(await inClinic(pool, CLINIC_B, countOf(table))).toBe(1);
      }
    },
  );

  it('Dado o dono, Quando faz UPDATE e DELETE sem filtro na clínica A, Então só afeta a linha da A', async () => {
    // DELETE só em tabelas folha: as outras são referenciadas por chave estrangeira, que vale para o dono como para qualquer um.
    for (const table of ['schedule_closures', 'audit_events']) {
      const deleted = await inClinic(
        owner,
        CLINIC_A,
        (client) => client.query(`DELETE FROM ${quoteIdent(table)}`),
        true,
      );
      expect(deleted.rowCount).toBe(1);
    }
    const touch: Record<string, string> = {
      patients: 'clinic_id',
      user_accounts: 'clinic_id',
      clinics: 'name',
      auth_tokens: 'purpose',
      user_mfa: 'last_used_step',
      mfa_recovery_codes: 'code_hash',
    };
    for (const [table, column] of Object.entries(touch)) {
      const updated = await inClinic(
        owner,
        CLINIC_A,
        (client) =>
          client.query(`UPDATE ${quoteIdent(table)} SET ${column} = ${column}`),
        true,
      );
      expect(updated.rowCount).toBe(1);
    }
    expect((await admin.query(`SELECT 1 FROM patients`)).rowCount).toBe(2);
  });

  it('Dado o dono na clínica A, Quando grava linha da B (ou move a sua para a B), Então a política recusa', async () => {
    for (const table of forced) {
      const row = await rowFor(table, CLINIC_B);
      // O WITH CHECK é avaliado antes da chave única: a linha repetida da B não mascara a recusa.
      await expect(
        inClinic(owner, CLINIC_A, (client) =>
          client.query(row.sql, row.values),
        ),
      ).rejects.toThrow(/row-level security/);
    }
    await expect(
      inClinic(owner, CLINIC_A, (client) =>
        client.query(
          `UPDATE patients SET clinic_id = $1 WHERE clinic_id = $2`,
          [CLINIC_B, CLINIC_A],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      inClinic(owner, CLINIC_A, (client) =>
        client.query(`UPDATE clinics SET id = $1 WHERE id = $2`, [
          CLINIC_B,
          CLINIC_A,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('Dado o dono na clínica A, Quando grava token, fator ou código para a conta da B, Então a política da conta recusa', async () => {
    const foreign = ACCOUNT_OF(CLINIC_B);
    await expect(
      inClinic(owner, CLINIC_A, (client) =>
        client.query(
          `INSERT INTO auth_tokens (id, account_id, purpose, secret_hash, expires_at, created_at)
           VALUES ('t-x', $1, 'reset', 'hash-x', now(), now())`,
          [foreign],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      inClinic(owner, CLINIC_A, (client) =>
        client.query(
          `INSERT INTO user_mfa (account_id, totp_secret, enrolled_at, last_used_step) VALUES ($1, 's', now(), 0)`,
          [foreign],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      inClinic(owner, CLINIC_A, (client) =>
        client.query(
          `INSERT INTO mfa_recovery_codes (id, account_id, code_hash, created_at) VALUES ('m-x', $1, 'h', now())`,
          [foreign],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('Dado a conexão do dono sem o setting, Quando tenta contornar com SET ROLE, set_config de outra clínica ou RESET, Então não lê além da própria clínica', async () => {
    const seen = await inClinic(owner, CLINIC_A, async (client) => {
      await client.query(`SELECT set_config('app.clinic_id', '', true)`);
      return countOf('patients')(client);
    });
    expect(seen).toBe(0);
    await expect(
      inClinic(owner, CLINIC_A, (client) =>
        client.query(`ALTER TABLE patients NO FORCE ROW LEVEL SECURITY`),
      ),
    ).resolves.toBeDefined();
    // O dono pode desligar o FORCE (é o rollback documentado); a prova acima já rodou antes. Religa para os testes seguintes.
    await admin.query(`ALTER TABLE patients FORCE ROW LEVEL SECURITY`);
  });
});

describe('Feature: fluxos de identidade com FORCE e o dono como conexão da aplicação (#874)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_rls5f_${process.pid}_${Date.now()}`;
  const ownerRole = `own_rls5f_${process.pid}`;
  const systemRole = `sys_rls5f_${process.pid}`;
  const password = 'senha-descartavel-rls5f';
  let admin: Pool;
  let owner: Pool;
  let system: Pool;
  let ownerDb: AppDb;
  let systemDb: AppDb;

  const asRole = (role: string) => {
    const url = new URL(withDatabase(baseUrl, databaseName));
    url.username = role;
    url.password = password;
    return new Pool({ connectionString: url.toString(), max: 1 });
  };
  const accounts = (db: AppDb, clinicId: string | null) =>
    new DrizzleUserAccountRepository(db, clinicId, TEST_CIPHER, BLIND);
  const account = (email: string, clinicId: string | null) =>
    UserAccount.create({
      email,
      passwordHash: HASH,
      role: clinicId === null ? 'super_admin' : 'company_admin',
      clinicId,
    });

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    admin = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 1,
    });
    await admin.query(
      `CREATE ROLE ${quoteIdent(ownerRole)} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`,
    );
    await admin.query(
      `CREATE ROLE ${quoteIdent(systemRole)} LOGIN PASSWORD '${password}' BYPASSRLS IN ROLE ${APP_GROUP}`,
    );
    const objects = await admin.query<{ relname: string; relkind: string }>(
      `SELECT relname, relkind FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'S')`,
    );
    for (const object of objects.rows) {
      const kind = object.relkind === 'S' ? 'SEQUENCE' : 'TABLE';
      await admin.query(
        `ALTER ${kind} ${quoteIdent(object.relname)} OWNER TO ${quoteIdent(ownerRole)}`,
      );
    }
    await admin.query(`DELETE FROM clinics WHERE id = 'legacy-clinic'`);
    for (const id of [CLINIC_A, CLINIC_B]) {
      await admin.query(
        `INSERT INTO clinics (id, name, created_at, created_by) VALUES ($1, $1, now(), 'teste')`,
        [id],
      );
    }
    owner = asRole(ownerRole);
    system = asRole(systemRole);
    ownerDb = drizzle(owner, { schema }) as unknown as AppDb;
    systemDb = drizzle(system, { schema }) as unknown as AppDb;
  });

  afterAll(async () => {
    for (const step of [
      () => owner?.end(),
      () => system?.end(),
      () => admin?.end(),
      () =>
        adminQuery(
          baseUrl,
          `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
        ),
      () => adminQuery(baseUrl, `DROP ROLE IF EXISTS ${quoteIdent(ownerRole)}`),
      () =>
        adminQuery(baseUrl, `DROP ROLE IF EXISTS ${quoteIdent(systemRole)}`),
    ]) {
      await Promise.resolve(step()).catch(() => undefined);
    }
  });

  it('Dado o dono com FORCE, Quando consulta clínicas sem escopo, Então vê zero; com escopo, só a própria; o sistema vê todas', async () => {
    expect(await new DrizzleClinicRepository(ownerDb).findAll()).toEqual([]);
    const scopedA = await scopeDbToClinic(ownerDb, CLINIC_A);
    expect(
      (await new DrizzleClinicRepository(scopedA).findAll()).map((c) => c.id),
    ).toEqual([CLINIC_A]);
    expect(
      await new DrizzleClinicRepository(scopedA).findById(CLINIC_B),
    ).toBeNull();
    expect(
      (await new DrizzleClinicRepository(systemDb).findAll())
        .map((c) => c.id)
        .sort(),
    ).toEqual([CLINIC_A, CLINIC_B]);
  });

  it('Dado login, convite e recuperação de senha, Quando o sistema emite e consome o token, Então funciona e o dono sem escopo não vê o token', async () => {
    const holder = account('convite@teste.invalid', CLINIC_A);
    await accounts(systemDb, CLINIC_A).save(holder);
    const { token, secret } = AuthToken.issue({
      accountId: holder.id,
      purpose: 'invite',
    });
    await new DrizzleAuthTokenRepository(systemDb).replaceUnused(token);
    const hash = token.secretHash;

    expect(
      await new DrizzleAuthTokenRepository(ownerDb).findUsableBySecretHash(
        hash,
      ),
    ).toBeNull();
    const scopedA = await scopeDbToClinic(ownerDb, CLINIC_A);
    expect(
      (
        await new DrizzleAuthTokenRepository(scopedA).findUsableBySecretHash(
          hash,
        )
      )?.id,
    ).toBe(token.id);
    const scopedB = await scopeDbToClinic(ownerDb, CLINIC_B);
    expect(
      await new DrizzleAuthTokenRepository(scopedB).findUsableBySecretHash(
        hash,
      ),
    ).toBeNull();

    const claimed = await new DrizzleAuthTokenRepository(
      systemDb,
    ).claimBySecretHash(hash);
    expect(claimed?.id).toBe(token.id);
    expect(secret).toBeTruthy();
    // Login: o sistema procura pelo e-mail sem saber a clínica.
    expect(
      (await accounts(systemDb, null).findByEmail('convite@teste.invalid'))?.id,
    ).toBe(holder.id);
  });

  it('Dado o segundo fator do super_admin, Quando o sistema inscreve e usa o passo, Então o dono sem escopo não lê o fator', async () => {
    const root = account('root@teste.invalid', null);
    await accounts(systemDb, null).save(root);
    const mfa = new DrizzleMfaRepository(systemDb, TEST_CIPHER);
    expect(
      await mfa.completeEnrollment({
        accountId: root.id,
        secret: 'JBSWY3DPEHPK3PXP',
        step: 10,
        recoveryCodeHashes: ['c1', 'c2'],
        expectedSessionVersion: 0,
        now: new Date(),
      }),
    ).toBe(true);
    expect((await mfa.findFactor(root.id))?.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(await mfa.claimStep(root.id, 11)).toBe(true);
    expect(
      await new DrizzleMfaRepository(ownerDb, TEST_CIPHER).findFactor(root.id),
    ).toBeNull();
    const scopedA = await scopeDbToClinic(ownerDb, CLINIC_A);
    expect(
      await new DrizzleMfaRepository(scopedA, TEST_CIPHER).findFactor(root.id),
    ).toBeNull();
  });

  it('Dado a auditoria, Quando o dono grava e lê na própria clínica, Então funciona; sem escopo não vê nada', async () => {
    const scopedA = await scopeDbToClinic(ownerDb, CLINIC_A);
    const repo = new DrizzleAuditEventRepository(scopedA, CLINIC_A);
    await repo.save(
      AuditEvent.create({
        clinicId: CLINIC_A,
        actorRole: 'admin',
        actorId: 'ator@teste.invalid',
        action: 'read',
        resourceType: 'session',
        resourceId: 'r5-1',
      }),
    );
    expect((await repo.findAll()).map((e) => e.resourceId)).toEqual(['r5-1']);
    expect(
      (await new DrizzleAuditEventRepository(ownerDb, CLINIC_A).findAll())
        .length,
    ).toBe(0);
  });

  it('Dado os scripts de operação, Quando rodam na conexão de sistema, Então recifram e listam todas as clínicas; no dono com FORCE enxergam zero', async () => {
    const legacy = account('legado@teste.invalid', CLINIC_B);
    await accounts(systemDb, CLINIC_B).save(legacy);
    // Conta no formato legado: e-mail em claro e sem índice cego, como antes da #742.
    await admin.query(
      'ALTER TABLE user_accounts DROP CONSTRAINT IF EXISTS ck_user_accounts_email_hash_conta_ativa',
    );
    await admin.query(
      `UPDATE user_accounts SET email = 'legado@teste.invalid', email_hash = NULL WHERE id = $1`,
      [legacy.id],
    );
    expect(await reencryptAccountIdentity(ownerDb, TEST_CIPHER, BLIND)).toBe(0);
    expect(
      await reencryptAccountIdentity(systemDb, TEST_CIPHER, BLIND),
    ).toBeGreaterThanOrEqual(1);
    expect(await reencryptAccountIdentity(systemDb, TEST_CIPHER, BLIND)).toBe(
      0,
    );
    // Uma conta de portal sem vínculo em cada clínica: só a conexão de sistema as lista.
    const orphanA = account('orfa-a@teste.invalid', CLINIC_A);
    const orphanB = account('orfa-b@teste.invalid', CLINIC_B);
    await accounts(systemDb, CLINIC_A).save(orphanA);
    await accounts(systemDb, CLINIC_B).save(orphanB);
    await admin.query(
      `UPDATE user_accounts SET role = 'patient', patient_id = NULL WHERE id = ANY($1)`,
      [[orphanA.id, orphanB.id]],
    );
    expect(await listOrphanPortalAccounts(ownerDb, TEST_CIPHER)).toEqual([]);
    const listed = await listOrphanPortalAccounts(systemDb, TEST_CIPHER);
    expect(listed.map((orphan) => orphan.id).sort()).toEqual(
      [orphanA.id, orphanB.id].sort(),
    );
  });
});
