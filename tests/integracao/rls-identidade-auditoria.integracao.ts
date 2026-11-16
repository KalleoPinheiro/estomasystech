import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import { FOREIGN_CLINIC_EVENT } from '@/domain/audit/audit-event-repository';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import { scopeDbToClinic } from '@/infrastructure/persistence/drizzle/clinic-scoped-pool';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAuditEventRepository } from '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository';
import { DrizzleClinicProvisioning } from '@/infrastructure/persistence/drizzle/drizzle-clinic-provisioning';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzleUserAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import { DrizzleGoogleAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-google-account-repository';
import { DrizzleMfaRepository } from '@/infrastructure/persistence/drizzle/drizzle-mfa-repository';
import { DrizzleTransactionManager } from '@/infrastructure/persistence/drizzle/drizzle-transaction-manager';
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
 * RLS lote de identidade e auditoria (#894, ADR-110): a migração 0081 liga a política `clinic_isolation` em
 * `user_accounts`, `google_accounts` e `audit_events`. O `clinic_id` das três é anulável (conta e evento de
 * sistema), e a linha sem empresa nunca casa com a política: só o papel de sistema (BYPASSRLS) a enxerga.
 *
 * Prova em Postgres real (o PGlite roda como superusuário e ignora a política), com os repositórios reais:
 * o papel da aplicação, preso a uma clínica, e o papel de sistema, que serve login, segundo fator, convite,
 * recuperação de senha, OAuth e a auditoria pré-sessão (`systemScope()` -> `getSystemDb()`).
 */
const CLINIC_A = 'clinic-rls894-a';
const CLINIC_B = 'clinic-rls894-b';
const APP_GROUP = 'estomasystech_app';
const TABLES = ['user_accounts', 'google_accounts', 'audit_events'] as const;
const HASH = 'scrypt$1$sal$hash';
const BLIND = new BlindIndex({
  current: 'pepper-de-teste-da-integracao-000000894',
});
const MIGRATION = path.join(
  process.cwd(),
  'drizzle',
  '0081_rls-identidade-auditoria.sql',
);
const migrationStatements = () =>
  readFileSync(MIGRATION, 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);

const account = (
  email: string,
  clinicId: string | null,
  role: 'company_admin' | 'super_admin' = 'company_admin',
) => UserAccount.create({ email, passwordHash: HASH, role, clinicId });

const event = (
  clinicId: string | null,
  resourceId: string,
  actorRole = 'admin',
) =>
  AuditEvent.create({
    clinicId,
    actorRole,
    actorId: 'ator@teste.invalid',
    action: 'read',
    resourceType: 'session',
    resourceId,
  });

describe('Feature: RLS em user_accounts, google_accounts e audit_events (#894)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_rls894_${process.pid}_${Date.now()}`;
  const appRole = `app_rls894_${process.pid}`;
  const systemRole = `sys_rls894_${process.pid}`;
  const password = 'senha-descartavel-rls894';
  let admin: Pool;
  let app: Pool;
  let system: Pool;
  let appDb: AppDb;
  let systemDb: AppDb;

  const asRole = (role: string) => {
    const url = new URL(withDatabase(baseUrl, databaseName));
    url.username = role;
    url.password = password;
    // max 1: a mesma conexão serve todas as transações, o pior caso para vazar o setting.
    return new Pool({ connectionString: url.toString(), max: 1 });
  };

  const clinicDb = (clinicId: string) => scopeDbToClinic(appDb, clinicId);
  const accountsOf = async (clinicId: string | null, db?: AppDb) =>
    new DrizzleUserAccountRepository(
      db ?? (clinicId === null ? systemDb : await clinicDb(clinicId)),
      clinicId,
      TEST_CIPHER,
      BLIND,
    );

  async function inClinic<T>(
    clinicId: string | null,
    fn: (client: PoolClient) => Promise<T>,
    pool: Pool = app,
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
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const idsOf = (table: string) => (client: PoolClient) =>
    client
      .query<{ id: string }>(`SELECT id FROM ${quoteIdent(table)} ORDER BY id`)
      .then((result) => result.rows.map((row) => row.id));

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    admin = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 1,
    });
    for (const id of [CLINIC_A, CLINIC_B]) {
      await admin.query(
        `INSERT INTO clinics (id, name, created_at, created_by) VALUES ($1, $1, now(), 'teste')`,
        [id],
      );
    }
    await admin.query(
      `CREATE ROLE ${quoteIdent(appRole)} LOGIN PASSWORD '${password}' IN ROLE ${APP_GROUP}`,
    );
    await admin.query(
      `CREATE ROLE ${quoteIdent(systemRole)} LOGIN PASSWORD '${password}' BYPASSRLS IN ROLE ${APP_GROUP}`,
    );
    app = asRole(appRole);
    system = asRole(systemRole);
    appDb = drizzle(app, { schema }) as unknown as AppDb;
    systemDb = drizzle(system, { schema }) as unknown as AppDb;
  });

  afterAll(async () => {
    // O papel de grupo é do cluster (compartilhado): só os logins deste arquivo saem.
    for (const step of [
      () => app?.end(),
      () => system?.end(),
      () => admin?.end(),
      () =>
        adminQuery(
          baseUrl,
          `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
        ),
      () => adminQuery(baseUrl, `DROP ROLE IF EXISTS ${quoteIdent(appRole)}`),
      () =>
        adminQuery(baseUrl, `DROP ROLE IF EXISTS ${quoteIdent(systemRole)}`),
    ]) {
      await Promise.resolve(step()).catch(() => undefined);
    }
  });

  it('Dado o esquema migrado, Quando leio o catálogo, Então as três tabelas têm RLS e a política clinic_isolation', async () => {
    const rows = await admin.query<{
      relname: string;
      relrowsecurity: boolean;
      policies: string[];
    }>(
      `SELECT c.relname, c.relrowsecurity,
              (SELECT array_agg(p.policyname::text ORDER BY p.policyname) FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
         FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1)
        ORDER BY c.relname`,
      [[...TABLES]],
    );
    expect(rows.rows.map((row) => ({ ...row }))).toEqual(
      [...TABLES].sort().map((relname) => ({
        relname,
        relrowsecurity: true,
        policies: ['clinic_isolation'],
      })),
    );
  });

  it('Dado o app, Quando cada clínica cria conta e o login (sistema) procura o e-mail, Então a clínica vê só as suas e o sistema vê todas', async () => {
    const accountA = account('mesmo@teste.invalid', CLINIC_A);
    const accountB = account('mesmo@teste.invalid', CLINIC_B);
    await (await accountsOf(CLINIC_A)).save(accountA);
    await (await accountsOf(CLINIC_B)).save(accountB);

    expect(
      (
        await (await accountsOf(CLINIC_A)).findAllByEmail('mesmo@teste.invalid')
      ).map((found) => found.id),
    ).toEqual([accountA.id]);
    expect(await (await accountsOf(CLINIC_A)).findById(accountB.id)).toBeNull();
    // Login: sem clínica conhecida, o papel de sistema acha as duas candidatas (MT-06).
    expect(
      (await (await accountsOf(null)).findAllByEmail('mesmo@teste.invalid'))
        .map((found) => found.id)
        .sort(),
    ).toEqual([accountA.id, accountB.id].sort());
    expect(await inClinic(null, idsOf('user_accounts'))).toEqual([]);
  });

  it('Dado a conta da B, Quando a clínica A tenta trocar senha, revogar sessões ou mover a linha, Então nada muda e o WITH CHECK recusa', async () => {
    const [victim] = await (await accountsOf(null))
      .findAllByEmail('mesmo@teste.invalid')
      .then((all) => all.filter((found) => found.clinicId === CLINIC_B));
    const before = await admin.query(
      `SELECT password_hash, session_version FROM user_accounts WHERE id = $1`,
      [victim.id],
    );
    const repoA = await accountsOf(CLINIC_A);
    await repoA.updatePasswordHash(victim.id, 'scrypt$1$outro$hash');
    await repoA.revokeSessions(victim.id);
    await repoA.revokeAllSessions();
    expect(
      (
        await admin.query(
          `SELECT password_hash, session_version FROM user_accounts WHERE id = $1`,
          [victim.id],
        )
      ).rows,
    ).toEqual(before.rows);
    await expect(
      inClinic(CLINIC_A, (client) =>
        client.query(
          `UPDATE user_accounts SET clinic_id = $1 WHERE clinic_id = $2`,
          [CLINIC_B, CLINIC_A],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('Dado o super_admin (sem clínica), Quando o sistema o cria e a aplicação o procura, Então só o sistema o enxerga e a aplicação não o cria', async () => {
    const root = account('root@teste.invalid', null, 'super_admin');
    await (await accountsOf(null)).save(root);

    expect((await (await accountsOf(null)).findSystemAccount())?.id).toBe(
      root.id,
    );
    expect(await (await accountsOf(CLINIC_A)).findSystemAccount()).toBeNull();
    await expect(
      inClinic(CLINIC_A, (client) =>
        client.query(
          `INSERT INTO user_accounts (id, clinic_id, email, password_hash, role, active, created_at)
           VALUES ('intruso', NULL, 'x@teste.invalid', 'h', 'super_admin', true, now())`,
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('Dado o fluxo de convite e senha, Quando a clínica cria a conta e o sistema define a senha (sem sessão), Então a troca vale e derruba as sessões', async () => {
    const invited = account('convidado@teste.invalid', CLINIC_A);
    await (await accountsOf(CLINIC_A)).save(invited);
    const system = await accountsOf(null);
    await system.updatePasswordHash(invited.id, 'scrypt$1$nova$hash');
    const row = await admin.query<{
      password_hash: string;
      session_version: number;
    }>(
      `SELECT password_hash, session_version FROM user_accounts WHERE id = $1`,
      [invited.id],
    );
    expect(row.rows[0]).toEqual({
      password_hash: 'scrypt$1$nova$hash',
      session_version: 1,
    });
  });

  it('Dado o segundo fator, Quando o sistema confirma a inscrição, usa o passo e a clínica abre uma unidade de trabalho, Então tudo segue funcionando', async () => {
    const holder = account('mfa@teste.invalid', CLINIC_A);
    await (await accountsOf(CLINIC_A)).save(holder);
    const mfa = new DrizzleMfaRepository(systemDb, TEST_CIPHER);
    expect(
      await mfa.completeEnrollment({
        accountId: holder.id,
        secret: 'JBSWY3DPEHPK3PXP',
        step: 10,
        recoveryCodeHashes: ['c1', 'c2'],
        expectedSessionVersion: 0,
        now: new Date(),
      }),
    ).toBe(true);
    expect((await mfa.findFactor(holder.id))?.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(await mfa.claimStep(holder.id, 11)).toBe(true);
    expect(await mfa.listUnusedRecoveryCodes(holder.id)).toHaveLength(2);

    const manager = new DrizzleTransactionManager(
      appDb,
      CLINIC_A,
      TEST_CIPHER,
      BLIND,
    );
    const seen = await manager.run(
      async (repos) =>
        (await repos.userAccounts.findById(holder.id))?.sessionVersion,
    );
    expect(seen).toBe(1);
  });

  it('Dado o auditor, Quando a clínica grava e lê eventos, Então só os da própria clínica e o evento de outra empresa é recusado', async () => {
    const repoA = new DrizzleAuditEventRepository(
      await clinicDb(CLINIC_A),
      CLINIC_A,
    );
    const repoB = new DrizzleAuditEventRepository(
      await clinicDb(CLINIC_B),
      CLINIC_B,
    );
    const mine = event(CLINIC_A, 'a-1');
    const theirs = event(CLINIC_B, 'b-1');
    await repoA.save(mine);
    await repoB.save(theirs);
    // Super admin agindo na clínica-alvo: evento sem empresa grava na clínica do escopo.
    await repoA.save(event(null, 'a-2', 'super_admin'));

    expect(
      (await repoA.findAll()).map((found) => found.resourceId).sort(),
    ).toEqual(['a-1', 'a-2']);
    await expect(repoA.save(theirs)).rejects.toThrow(FOREIGN_CLINIC_EVENT);
    await expect(
      inClinic(CLINIC_A, (client) =>
        client.query(
          `INSERT INTO audit_events (id, clinic_id, actor_role, actor_id, action, resource_type, resource_id, occurred_at)
           VALUES ('forjado', $1, 'admin', 'x', 'read', 'session', 'x', now())`,
          [CLINIC_B],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await repoA.lockResource('document', 'doc-1');
  });

  it('Dado a auditoria pré-sessão, Quando o sistema grava evento sem empresa e de qualquer clínica, Então a trilha de plataforma o lê e a aplicação não', async () => {
    const repo = new DrizzleAuditEventRepository(systemDb, null);
    await repo.save(event(null, 'login-falho'));
    await repo.save(event(CLINIC_B, 'login-b', 'company_admin'));

    const trail = await repo.findPlatformTrail();
    expect(trail.map((found) => found.resourceId)).toEqual(
      expect.arrayContaining(['login-falho', 'a-2']),
    );
    expect(
      (
        await new DrizzleAuditEventRepository(
          await clinicDb(CLINIC_A),
          CLINIC_A,
        ).findAll()
      )
        .map((found) => found.resourceId)
        .sort(),
    ).toEqual(['a-1', 'a-2']);
    expect(await inClinic(null, idsOf('audit_events'))).toEqual([]);
    expect((await repo.findAll()).length).toBeGreaterThanOrEqual(5);
  });

  it('Dado o OAuth do Google, Quando cada clínica e o sistema conectam contas, Então cada um lê só a sua e a aplicação não vê a do sistema', async () => {
    const stamp = new Date('2026-11-16T10:00:00Z');
    const connect = (email: string) => ({
      email,
      encryptedRefreshToken: 'token-cifrado',
      connectedAt: stamp,
    });
    const repoA = new DrizzleGoogleAccountRepository(
      await clinicDb(CLINIC_A),
      CLINIC_A,
    );
    const repoB = new DrizzleGoogleAccountRepository(
      await clinicDb(CLINIC_B),
      CLINIC_B,
    );
    const repoSystem = new DrizzleGoogleAccountRepository(systemDb, null);
    await repoA.save(connect('a@gmail.invalid'));
    await repoB.save(connect('b@gmail.invalid'));
    await repoSystem.save(connect('sistema@gmail.invalid'));

    expect((await repoA.findMostRecent())?.email).toBe('a@gmail.invalid');
    expect(await repoA.findByEmail('b@gmail.invalid')).toBeNull();
    expect(await repoA.findByEmail('sistema@gmail.invalid')).toBeNull();
    expect((await repoSystem.findByEmail('sistema@gmail.invalid'))?.email).toBe(
      'sistema@gmail.invalid',
    );
    expect(await inClinic(null, idsOf('google_accounts'))).toEqual([]);
    await expect(
      inClinic(CLINIC_A, (client) =>
        client.query(
          `UPDATE google_accounts SET clinic_id = $1 WHERE clinic_id = $2`,
          [CLINIC_B, CLINIC_A],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('Dado o provisionamento de clínica pela plataforma, Quando o sistema cria clínica, admin e evento na mesma transação, Então tudo grava', async () => {
    const provisioning = new DrizzleClinicProvisioning(systemDb);
    const clinic = Clinic.restore({
      id: 'clinic-rls894-nova',
      name: 'Nova',
      createdBy: 'root@teste.invalid',
      createdAt: new Date(),
    });
    const novoAdmin = account('admin-novo@teste.invalid', clinic.id);
    await provisioning.run(clinic.id, async (repos) => {
      await repos.clinics.create(clinic);
      await repos.userAccounts.save(novoAdmin);
      await repos.auditEvents.save(
        event(clinic.id, 'provisionada', 'super_admin'),
      );
    });

    expect(
      (await new DrizzleClinicRepository(systemDb).findById(clinic.id))?.id,
    ).toBe(clinic.id);
    expect(
      (
        await admin.query(
          `SELECT 1 FROM user_accounts WHERE id = $1 AND clinic_id = $2`,
          [novoAdmin.id, clinic.id],
        )
      ).rowCount,
    ).toBe(1);
  });

  it('Dado uma consulta sem filtro de empresa, Quando a aplicação lê as três tabelas sem app.clinic_id, Então falha fechado e o dono não é filtrado', async () => {
    for (const table of TABLES) {
      expect(await inClinic(null, idsOf(table))).toEqual([]);
      expect(
        (await app.query(`SELECT 1 FROM ${quoteIdent(table)}`)).rowCount,
      ).toBe(0);
      expect(
        (await admin.query(`SELECT 1 FROM ${quoteIdent(table)}`)).rowCount,
      ).toBeGreaterThan(0);
    }
    const owned = await systemDb
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.clinicId, CLINIC_A));
    expect(owned.length).toBeGreaterThan(0);
  });

  it('Dado o SQL da migração, Quando aplico duas vezes, Então é idempotente e o rollback (DISABLE) devolve as linhas ao papel da aplicação', async () => {
    for (let round = 0; round < 2; round++) {
      for (const statement of migrationStatements())
        await admin.query(statement);
    }
    expect(await inClinic(CLINIC_A, idsOf('audit_events'))).not.toEqual([]);
    for (const table of TABLES) {
      await admin.query(
        `ALTER TABLE ${quoteIdent(table)} DISABLE ROW LEVEL SECURITY`,
      );
    }
    // Sem RLS, o papel da aplicação volta a ver tudo (a aplicação filtra por clínica, como antes).
    expect(
      (await app.query(`SELECT 1 FROM user_accounts WHERE clinic_id IS NULL`))
        .rowCount,
    ).toBe(1);
    for (const statement of migrationStatements()) await admin.query(statement);
    expect((await app.query(`SELECT 1 FROM user_accounts`)).rowCount).toBe(0);
  });
});
