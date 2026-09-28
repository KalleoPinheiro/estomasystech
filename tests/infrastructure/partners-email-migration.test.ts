import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

type Db = PgliteDatabase<typeof schema>;

/** Campos do erro do Postgres, dentro ou fora do `DrizzleQueryError`. */
function pgFieldsOf(error: unknown): { code?: string; constraint?: string } {
  const cause = error instanceof Error ? error.cause : undefined;
  return (cause ?? error) as { code?: string; constraint?: string };
}

const insertPartner = (db: Db, id: string, clinicId: string, email: string) =>
  db.execute(
    sql`INSERT INTO partners (id, clinic_id, full_name, email, phone, created_at)
        VALUES (${id}, ${clinicId}, 'Dr. Migração', ${email}, '11900000000', now())`,
  );

describe('Feature: E-mail do parceiro único por empresa no banco (B7, migração 0046)', () => {
  let db: Db;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    await db.execute(
      sql`INSERT INTO clinics (id, name, created_by, created_at)
          VALUES ('mig-a', 'A', 'test', now()), ('mig-b', 'B', 'test', now())`,
    );
  });

  it('Dadas duas clínicas, Quando gravar o mesmo e-mail de parceiro em cada uma, Então o banco aceita', async () => {
    await insertPartner(db, 'p-a', 'mig-a', 'mesmo@x.com');
    await insertPartner(db, 'p-b', 'mig-b', 'mesmo@x.com');

    const rows = (await db.execute(
      sql`SELECT clinic_id FROM partners WHERE email = 'mesmo@x.com' ORDER BY clinic_id`,
    )) as unknown as { rows: Record<string, unknown>[] };
    expect(rows.rows).toEqual([{ clinic_id: 'mig-a' }, { clinic_id: 'mig-b' }]);
  });

  it('Dada a mesma clínica, Quando gravar o e-mail duas vezes, Então recusa com uq_partners_clinic_email', async () => {
    await insertPartner(db, 'p-dup-1', 'mig-a', 'dup@x.com');

    const error = await insertPartner(db, 'p-dup-2', 'mig-a', 'dup@x.com').then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(pgFieldsOf(error)).toMatchObject({
      code: '23505',
      constraint: 'uq_partners_clinic_email',
    });
  });
});
