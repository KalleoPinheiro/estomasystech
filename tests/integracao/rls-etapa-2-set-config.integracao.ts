import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { scopeDbToClinic } from '@/infrastructure/persistence/drizzle/clinic-scoped-pool';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleTransactionManager } from '@/infrastructure/persistence/drizzle/drizzle-transaction-manager';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * RLS etapa 2 (#871, ADR-110): toda consulta e toda transação enxergam `app.clinic_id` da clínica do
 * escopo, e o valor some quando a transação termina. Ainda não há política, então a prova é a leitura
 * de `current_setting` no Postgres real, com o pool de UMA conexão (o pior caso para vazamento).
 */
describe('Feature: app.clinic_id em toda unidade de trabalho (#871)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_rls2_${process.pid}_${Date.now()}`;
  let pool: Pool;
  let raw: AppDb;

  const rowOf = async (db: Pick<AppDb, 'execute'>) => {
    const result = await db.execute(
      sql`select current_setting('app.clinic_id', true) as v`,
    );
    return (result as unknown as { rows: { v: string | null }[] }).rows[0];
  };
  const setting = async (db: AppDb) => (await rowOf(db)).v;

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    pool = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 1,
    });
    raw = drizzle(pool, { schema }) as unknown as AppDb;
  });

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await adminQuery(
      baseUrl,
      `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
    ).catch(() => undefined);
  });

  it('Dado uma consulta avulsa no db com escopo, Então vê a clínica, e a seguinte na mesma conexão não vê', async () => {
    const scoped = await scopeDbToClinic(raw, 'clinica-a');

    expect(await setting(scoped)).toBe('clinica-a');
    expect(await setting(raw)).toBeOneOf([null, '']);
  });

  it('Dado dois escopos alternando na mesma conexão, Então cada um vê só a própria clínica', async () => {
    const a = await scopeDbToClinic(raw, 'clinica-a');
    const b = await scopeDbToClinic(raw, 'clinica-b');

    expect(await setting(a)).toBe('clinica-a');
    expect(await setting(b)).toBe('clinica-b');
    expect(await setting(a)).toBe('clinica-a');
  });

  it('Dado db.transaction no db com escopo, Então todas as consultas da transação veem a clínica', async () => {
    const scoped = await scopeDbToClinic(raw, 'clinica-a');

    const seen = await scoped.transaction(async (tx) => [
      await rowOf(tx),
      await rowOf(tx),
    ]);

    expect(seen).toEqual([{ v: 'clinica-a' }, { v: 'clinica-a' }]);
    expect(await setting(raw)).toBeOneOf([null, '']);
  });

  it('Dado uma consulta que falha, Então desfaz, devolve o erro e a conexão segue limpa', async () => {
    const scoped = await scopeDbToClinic(raw, 'clinica-a');

    await expect(
      scoped.execute(sql`select * from tabela_que_nao_existe`),
    ).rejects.toBeDefined();

    expect(await setting(scoped)).toBe('clinica-a');
    expect(await setting(raw)).toBeOneOf([null, '']);
  });

  it('Dado o gerenciador com clínica, Então set_config roda antes do corpo, dentro da transação', async () => {
    const seen: string[] = [];
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (q) => seen.push(q) },
    }) as unknown as AppDb;

    await new DrizzleTransactionManager(logged, 'clinica-c', TEST_CIPHER).run(
      async () => undefined,
    );

    expect(seen.map((q) => q.split(' ').slice(0, 2).join(' '))).toEqual([
      'begin',
      'select set_config($1,',
      'commit',
    ]);
  });

  it('Dado o gerenciador de sistema (clínica nula), Então não grava app.clinic_id', async () => {
    const seen: string[] = [];
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (q) => seen.push(q) },
    }) as unknown as AppDb;

    await new DrizzleTransactionManager(logged, null, TEST_CIPHER).run(
      async () => undefined,
    );

    expect(seen).toEqual(['begin', 'commit']);
  });
});
