import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { BlindIndex } from '@/lib/blind-index';
import { TEST_CIPHER } from '../support/cipher';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const CLINIC_ID = 'clinic-findall-snapshot';
const BLIND = new BlindIndex({
  current: 'pepper-de-teste-da-integracao-000000001',
});

type QueryFn = (...args: unknown[]) => Promise<unknown>;

/**
 * #855, Postgres real: uma renomeação confirmada por OUTRA conexão entre a leitura dos nomes e a
 * leitura das linhas não pode aparecer na página. O gancho roda logo depois da primeira leitura de
 * `patients` (a seleção) e confirma a renomeação antes de a segunda leitura (as linhas) começar.
 */
describe('Feature: findAll lê a página num único snapshot (#855, Postgres real)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_snap_${process.pid}_${Date.now()}`;
  let appPool: Pool;
  let otherPool: Pool;
  let repo: DrizzlePatientRepository;
  let afterFirstRead: (() => Promise<void>) | null = null;

  const renameFromOtherConnection = async (id: string, fullName: string) => {
    await drizzle(otherPool, { schema }).execute(
      sql`UPDATE patients SET full_name = ${TEST_CIPHER.encrypt(fullName)} WHERE id = ${id}`,
    );
  };

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    const url = withDatabase(baseUrl, databaseName);
    appPool = new Pool({ connectionString: url, max: 2 });
    otherPool = new Pool({ connectionString: url, max: 1 });

    // `pool.query` chama `connect(callback)` por dentro: só o `connect()` em promessa (o do
    // `db.transaction`) ganha o gancho.
    const connect = appPool.connect.bind(appPool) as unknown as (
      ...args: unknown[]
    ) => Promise<{ query: QueryFn }>;
    (appPool as unknown as { connect: typeof connect }).connect = async (
      ...args: unknown[]
    ) => {
      if (args.length > 0) return connect(...args);
      const client = await connect();
      const query = client.query.bind(client);
      client.query = async (...args: unknown[]) => {
        const result = await query(...args);
        const first = args[0];
        const text = typeof first === 'string' ? first : '';
        const config = (first as { text?: string } | undefined)?.text ?? text;
        if (afterFirstRead && /from "patients"/i.test(config)) {
          const hook = afterFirstRead;
          afterFirstRead = null;
          await hook();
        }
        return result;
      };
      return client;
    };

    const db = drizzle(appPool, { schema });
    await db.insert(schema.clinics).values({
      id: CLINIC_ID,
      name: 'Clínica Snapshot',
      createdAt: new Date('2026-10-20T10:00:00Z'),
      createdBy: 'teste',
    });
    repo = new DrizzlePatientRepository(
      db as never,
      CLINIC_ID,
      TEST_CIPHER,
      BLIND,
    );
  });

  afterAll(async () => {
    await appPool.end();
    await otherPool.end();
    await adminQuery(
      baseUrl,
      `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
    );
  });

  it('Dado uma renomeação confirmada entre as duas leituras, Quando listo, Então a página mostra o nome da seleção, não o renomeado', async () => {
    const ana = Patient.create({
      fullName: 'Ana Snapshot',
      email: 'ana-snapshot@x.com',
      phone: '11911110000',
    });
    const bruno = Patient.create({
      fullName: 'Bruno Snapshot',
      email: 'bruno-snapshot@x.com',
      phone: '11911110001',
    });
    await repo.save(ana);
    await repo.save(bruno);

    let renamed = false;
    afterFirstRead = async () => {
      await renameFromOtherConnection(ana.id, 'Zélia Renomeada');
      renamed = true;
    };

    const page = await repo.findAll();

    expect(renamed).toBe(true);
    expect(page.map((p) => p.fullName)).toEqual([
      'Ana Snapshot',
      'Bruno Snapshot',
    ]);
    // a renomeação foi confirmada: a próxima listagem já a enxerga e reordena
    const next = await repo.findAll();
    expect(next.map((p) => p.fullName)).toEqual([
      'Bruno Snapshot',
      'Zélia Renomeada',
    ]);
  });
});
