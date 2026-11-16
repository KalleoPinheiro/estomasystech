import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Spike #729 (ADR-110): prova, em Postgres real, que o Row-Level Security barra a leitura e a
 * escrita entre clínicas mesmo quando a aplicação "esquece" o filtro. Nada disto liga o RLS na
 * migração: as políticas vivem só no banco clonado deste arquivo.
 */
const CLINIC_A = 'clinic-rls-a';
const CLINIC_B = 'clinic-rls-b';
const TABLES = ['patients', 'partners', 'supplies'] as const;
const createdAt = new Date('2026-11-15T10:00:00Z');

describe('Feature: RLS por clínica como defesa em profundidade (#729)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_rls_${process.pid}_${Date.now()}`;
  const appRole = `app_rls_${process.pid}`;
  const systemRole = `sys_rls_${process.pid}`;
  const password = 'senha-descartavel-rls';
  let admin: Pool;
  let app: Pool;
  let system: Pool;

  /** Executa `fn` numa transação com `app.clinic_id` local, como o repositório faria. */
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

  const countPatients = (client: PoolClient) =>
    client
      .query<{ clinic_id: string }>(
        'SELECT clinic_id FROM patients ORDER BY clinic_id',
      )
      .then((result) => result.rows.map((row) => row.clinic_id));

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    const url = withDatabase(baseUrl, databaseName);
    admin = new Pool({ connectionString: url, max: 1 });
    const db = drizzle(admin, { schema });
    for (const [id, name] of [
      [CLINIC_A, 'Clínica A'],
      [CLINIC_B, 'Clínica B'],
    ]) {
      await db
        .insert(schema.clinics)
        .values({ id, name, createdAt, createdBy: 'teste' });
      await db.insert(schema.patients).values({
        id: `patient-${id}`,
        clinicId: id,
        fullName: `Paciente ${name}`,
        phone: '11999990000',
        createdAt,
      });
      await db.insert(schema.partners).values({
        id: `partner-${id}`,
        clinicId: id,
        fullName: `Parceiro ${name}`,
        email: `${id}@exemplo.test`,
        phone: '11999990001',
        createdAt,
      });
      await db.insert(schema.supplies).values({
        id: `supply-${id}`,
        clinicId: id,
        name: `Insumo ${name}`,
        unit: 'un',
        minQty: 1,
        priceCents: 100,
        createdAt,
      });
    }

    // Papel da aplicação: sem SUPERUSER e sem BYPASSRLS. Papel de sistema (cron): BYPASSRLS.
    await admin.query(
      `CREATE ROLE ${quoteIdent(appRole)} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`,
    );
    await admin.query(
      `CREATE ROLE ${quoteIdent(systemRole)} LOGIN PASSWORD '${password}' NOSUPERUSER BYPASSRLS`,
    );
    for (const role of [appRole, systemRole]) {
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ${TABLES.join(', ')} TO ${quoteIdent(role)}`,
      );
    }
    for (const table of TABLES) {
      await admin.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      // Sem `app.clinic_id`, current_setting(…, true) devolve NULL: a política falha fechada.
      // Desde a etapa 3 (#872) a migração 0076 já cria a política em partners e supplies: recria a do spike.
      await admin.query(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
      await admin.query(
        `CREATE POLICY tenant_isolation ON ${table}
           USING (clinic_id = current_setting('app.clinic_id', true))
           WITH CHECK (clinic_id = current_setting('app.clinic_id', true))`,
      );
    }

    const asRole = (role: string) => {
      const roleUrl = new URL(url);
      roleUrl.username = role;
      roleUrl.password = password;
      // max 1: a mesma conexão serve todas as transações, o pior caso para vazar o setting.
      return new Pool({ connectionString: roleUrl.toString(), max: 1 });
    };
    app = asRole(appRole);
    system = asRole(systemRole);
  });

  afterAll(async () => {
    // Limpeza tolerante: `beforeAll` pode ter falhado no meio, e cada passo roda mesmo se o anterior falhar.
    const steps: Array<() => Promise<unknown> | undefined> = [
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
    ];
    for (const step of steps) {
      await Promise.resolve(step()).catch(() => undefined);
    }
  });

  it('Dado o papel da aplicação, Quando consulto sem WHERE de clínica, Então só vejo a clínica da transação', async () => {
    expect(await inClinic(CLINIC_A, countPatients)).toEqual([CLINIC_A]);
    expect(await inClinic(CLINIC_B, countPatients)).toEqual([CLINIC_B]);
  });

  it.each(TABLES)(
    'Dado %s, Quando consulto a clínica B por id estando na A, Então a política devolve zero linhas',
    async (table) => {
      const rows = await inClinic(CLINIC_A, (client) =>
        client.query(`SELECT id FROM ${table} WHERE clinic_id = $1`, [
          CLINIC_B,
        ]),
      );
      expect(rows.rowCount).toBe(0);
    },
  );

  it('Dado a transação sem app.clinic_id, Quando leio, Então falha fechado (zero linhas)', async () => {
    expect(await inClinic(null, countPatients)).toEqual([]);
  });

  it('Dado a clínica A, Quando tento gravar ou mover linha para a B, Então WITH CHECK recusa', async () => {
    await expect(
      inClinic(CLINIC_A, (client) =>
        client.query(
          `INSERT INTO patients (id, clinic_id, full_name, phone, created_at)
           VALUES ('invasor', $1, 'Invasor', '11', now())`,
          [CLINIC_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      inClinic(CLINIC_A, (client) =>
        client.query(`UPDATE patients SET clinic_id = $1`, [CLINIC_B]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('Dado a clínica A, Quando atualizo e removo sem filtro, Então só afeto as linhas da A', async () => {
    const updated = await inClinic(CLINIC_A, (client) =>
      client.query(`UPDATE supplies SET min_qty = 2`),
    );
    expect(updated.rowCount).toBe(1);
    const removed = await inClinic(CLINIC_A, (client) =>
      client.query(`DELETE FROM partners`),
    );
    expect(removed.rowCount).toBe(1);
    const survivors = await admin.query(`SELECT id FROM partners ORDER BY id`);
    expect(survivors.rows).toEqual([{ id: `partner-${CLINIC_B}` }]);
  });

  it('Dado o pool com uma só conexão, Quando a transação da A termina, Então o setting não vaza para a seguinte', async () => {
    await inClinic(CLINIC_A, countPatients);
    const leaked = await app.query(
      `SELECT current_setting('app.clinic_id', true) AS value`,
    );
    // set_config(..., true) é local à transação: volta ao padrão (vazio ou NULL) no COMMIT.
    expect(leaked.rows[0].value ?? '').toBe('');
    expect((await app.query('SELECT id FROM patients')).rowCount).toBe(0);
  });

  it('Dado o papel de sistema com BYPASSRLS (cron), Quando leio, Então vejo todas as clínicas', async () => {
    expect(await inClinic(null, countPatients, system)).toEqual([
      CLINIC_A,
      CLINIC_B,
    ]);
  });

  it('Dado o papel da aplicação, Quando inspeciono o catálogo, Então não é superusuário nem tem BYPASSRLS', async () => {
    const role = await app.query(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    // Superusuário e BYPASSRLS ignoram a política: a aplicação nunca pode conectar com eles.
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});
