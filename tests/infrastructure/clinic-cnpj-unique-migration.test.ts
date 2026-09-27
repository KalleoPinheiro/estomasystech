import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

type Db = PgliteDatabase<typeof schema>;

const insertClinic = (db: Db, id: string, cnpj: string | null) =>
  db.execute(
    sql`INSERT INTO clinics (id, name, created_at, created_by, cnpj, contact_phone, contact_email)
        VALUES (${id}, ${`Clínica ${id}`}, now(), 'system', ${cnpj}, '11 3333-4444', 'c@x.com')`,
  );

/** SQLSTATE e mensagem do erro do Postgres, dentro ou fora do `DrizzleQueryError`. */
function pgErrorOf(error: unknown): { code?: string; message: string } {
  const cause = error instanceof Error ? error.cause : undefined;
  const source = (cause ?? error) as { code?: string; message?: string };
  return { code: source.code, message: String(source.message) };
}

describe('Feature: Contato e CNPJ único das clínicas (B4, migração 0043)', () => {
  let db: Db;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
  });

  it('Dado uma clínica com um CNPJ, Quando gravar outra com o mesmo, Então recusa o mesmo CNPJ em duas clínicas (23505, uq_clinics_cnpj)', async () => {
    await insertClinic(db, 'dup-1', '12.345.678/0001-95');

    const error = await insertClinic(db, 'dup-2', '12.345.678/0001-95').then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(pgErrorOf(error).code).toBe('23505');
    expect(pgErrorOf(error).message).toContain('uq_clinics_cnpj');
  });

  it('Dadas duas clínicas sem CNPJ, Quando gravar, Então CNPJ nulo não conflita e o contato é guardado', async () => {
    await insertClinic(db, 'null-1', null);
    await insertClinic(db, 'null-2', null);

    const rows = (await db.execute(
      sql`SELECT id, contact_phone, contact_email FROM clinics WHERE id IN ('null-1','null-2') ORDER BY id`,
    )) as unknown as { rows: Record<string, string>[] };
    expect(rows.rows).toEqual([
      { id: 'null-1', contact_phone: '11 3333-4444', contact_email: 'c@x.com' },
      { id: 'null-2', contact_phone: '11 3333-4444', contact_email: 'c@x.com' },
    ]);
  });
});
