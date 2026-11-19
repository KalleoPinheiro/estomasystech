import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

type Db = PgliteDatabase<typeof schema>;

const CONSTRAINT = 'ck_user_accounts_email_hash_conta_ativa';

const insertConta = (
  db: Db,
  id: string,
  emailHash: string | null,
  anonymizedAt: string | null,
) =>
  db.execute(
    sql`INSERT INTO user_accounts (id, clinic_id, email, email_hash, password_hash, role, active, created_at, anonymized_at)
        VALUES (${id}, 'c1', ${`${id}@x.com`}, ${emailHash}, 'scrypt$x', 'atendente', true, now(), ${anonymizedAt}::timestamptz)`,
  );

function pgErrorOf(error: unknown): { code?: string; message: string } {
  const cause = error instanceof Error ? error.cause : undefined;
  const source = (cause ?? error) as { code?: string; message?: string };
  return { code: source.code, message: String(source.message) };
}

describe('Feature: conta ativa exige o índice cego do e-mail (#909, ADR-111, migração 0085)', () => {
  let db: Db;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    await db.execute(
      sql`INSERT INTO clinics (id, name, created_at, created_by) VALUES ('c1', 'Clínica', now(), 'system')`,
    );
  });

  it('Dada conta ativa sem email_hash, Quando gravar, Então o banco recusa (23514)', async () => {
    const error = await insertConta(db, 'ativa-sem-hash', null, null).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(pgErrorOf(error).code).toBe('23514');
    expect(pgErrorOf(error).message).toContain(CONSTRAINT);
  });

  it('Dada conta ativa com email_hash, Quando gravar, Então grava', async () => {
    await expect(
      insertConta(db, 'ativa-com-hash', 'b1.k.aa', null),
    ).resolves.toBeDefined();
  });

  it('Dada conta anonimizada sem email_hash, Quando gravar, Então grava (a retenção zera o hash)', async () => {
    await expect(
      insertConta(db, 'anonimizada', null, '2026-01-01T00:00:00Z'),
    ).resolves.toBeDefined();
  });

  it('Dada conta ativa, Quando a retenção zerar o hash sem marcar anonymized_at, Então o banco recusa', async () => {
    const error = await db
      .execute(
        sql`UPDATE user_accounts SET email_hash = NULL WHERE id = 'ativa-com-hash'`,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(pgErrorOf(error).code).toBe('23514');
  });
});
