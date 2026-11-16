import { describe, expect, it, vi } from 'vitest';
import {
  CLINIC_SETTING,
  ClinicScopedPool,
  scopeDbToClinic,
} from '@/infrastructure/persistence/drizzle/clinic-scoped-pool';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';

/** Cliente falso: registra o texto de cada consulta e falha onde o teste mandar. */
function fakeClient(
  options: { failOn?: RegExp; rollbackFails?: boolean } = {},
) {
  const log: string[] = [];
  const client = {
    escapeLiteral: (value: string) => `'${value.replaceAll("'", "''")}'`,
    release: vi.fn(),
    query: vi.fn(async (config: string | { text: string }) => {
      const text = typeof config === 'string' ? config : config.text;
      log.push(text);
      if (options.rollbackFails && text === 'rollback') throw new Error('rb');
      if (options.failOn?.test(text)) throw new Error('boom');
      return { rows: [{ ok: true }] };
    }),
  };
  return { client, log, pool: { connect: vi.fn(async () => client) } };
}

describe('Feature: pool com a clínica gravada (RLS etapa 2, ADR-110)', () => {
  it('Dado uma consulta avulsa, Então abre transação, grava app.clinic_id e confirma', async () => {
    const { client, log, pool } = fakeClient();
    const scoped = new ClinicScopedPool(pool as never, 'clinica-1');

    const result = await scoped.query({ text: 'select 1' } as never, []);

    expect(result).toEqual({ rows: [{ ok: true }] });
    expect(log).toEqual([
      `begin; select set_config('${CLINIC_SETTING}', 'clinica-1', true)`,
      'select 1',
      'commit',
    ]);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('Dado um id com aspas, Então o literal é escapado (sem injeção)', async () => {
    const { log, pool } = fakeClient();

    await new ClinicScopedPool(
      pool as never,
      "x'); drop table patients;--",
    ).query('select 1');

    expect(log[0]).toContain("'x''); drop table patients;--'");
  });

  it('Dado erro na consulta, Então desfaz, devolve o erro e libera a conexão inteira', async () => {
    const { client, log, pool } = fakeClient({ failOn: /^select 1$/ });

    await expect(
      new ClinicScopedPool(pool as never, 'c').query('select 1'),
    ).rejects.toThrow('boom');

    expect(log.at(-1)).toBe('rollback');
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('Dado que o rollback também falha, Então a conexão é descartada (release com erro)', async () => {
    const { client, pool } = fakeClient({
      failOn: /^select 1$/,
      rollbackFails: true,
    });

    await expect(
      new ClinicScopedPool(pool as never, 'c').query('select 1'),
    ).rejects.toThrow('boom');

    expect(client.release).toHaveBeenCalledWith(true);
  });

  it('Dado db.transaction, Então o cliente grava a clínica logo depois do begin e só nele', async () => {
    const { client, log, pool } = fakeClient();
    const scoped = new ClinicScopedPool(pool as never, 'clinica-2');

    const tx = await scoped.connect();
    await tx.query({ text: 'begin' } as never, []);
    await tx.query({ text: 'select 2' } as never, []);
    await tx.query('  BEGIN isolation level serializable');
    tx.release();

    expect(log).toEqual([
      'begin',
      `select set_config('${CLINIC_SETTING}', $1, true)`,
      'select 2',
      '  BEGIN isolation level serializable',
      `select set_config('${CLINIC_SETTING}', $1, true)`,
    ]);
    expect(client.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      'clinica-2',
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('Dado config sem texto, Então não confunde com begin', async () => {
    const { log, pool } = fakeClient();
    const tx = await new ClinicScopedPool(pool as never, 'c').connect();

    await tx.query({} as never);

    expect(log).toEqual([undefined]);
  });

  it('Dado escopo de sistema ou driver sem pool (PGlite), Então devolve o próprio db', async () => {
    const pglite = { $client: { query: () => undefined } } as unknown as AppDb;
    const noClient = {} as unknown as AppDb;

    await expect(scopeDbToClinic(pglite, 'c')).resolves.toBe(pglite);
    await expect(scopeDbToClinic(noClient, 'c')).resolves.toBe(noClient);
    const pool = { connect: () => undefined, totalCount: 0 };
    const real = { $client: pool } as unknown as AppDb;
    await expect(scopeDbToClinic(real, null)).resolves.toBe(real);
  });

  it('Dado pool do node-postgres e uma clínica, Então devolve outro db', async () => {
    const pool = { connect: () => undefined, totalCount: 0 };
    const real = { $client: pool } as unknown as AppDb;

    const scoped = await scopeDbToClinic(real, 'clinica-3');

    expect(scoped).not.toBe(real);
  });
});

describe('Feature: gerenciador de transação grava a clínica (RLS etapa 2)', () => {
  async function run(clinicId: string | null) {
    const { drizzle } = await import('drizzle-orm/pglite');
    const { DrizzleTransactionManager } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-transaction-manager'
    );
    const schema = await import('@/infrastructure/persistence/drizzle/schema');
    const { TEST_CIPHER } = await import('./../support/cipher');
    const { createPgliteFromTemplate } = await import(
      './../support/pglite-template'
    );
    const queries: string[] = [];
    const db = drizzle(await createPgliteFromTemplate(), {
      schema,
      logger: { logQuery: (query) => queries.push(query) },
    }) as unknown as AppDb;
    await new DrizzleTransactionManager(db, clinicId, TEST_CIPHER).run(
      async () => undefined,
    );
    return queries;
  }

  it('Dado clínica, Então o set_config local é a primeira consulta da transação', async () => {
    const queries = await run('clinica-x');

    expect(queries.some((q) => /set_config/.test(q))).toBe(true);
  });

  it('Dado escopo de sistema, Então não grava clínica nenhuma', async () => {
    const queries = await run(null);

    expect(queries.some((q) => /set_config/.test(q))).toBe(false);
  });
});
