import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

type Db = PgliteDatabase<typeof schema>;

const insertConta = (db: Db, id: string, email: string, emailHash: string) =>
  db.execute(
    sql`INSERT INTO user_accounts (id, clinic_id, email, email_hash, password_hash, role, active, created_at)
        VALUES (${id}, 'c1', ${email}, ${emailHash}, 'scrypt$x', 'atendente', true, now())`,
  );

describe('Feature: contração do e-mail de login (ADR-111, migração 0090)', () => {
  let db: Db;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    await db.execute(
      sql`INSERT INTO clinics (id, name, created_at, created_by) VALUES ('c1', 'Clínica', now(), 'system')`,
    );
  });

  it('Dada a migração aplicada, Quando ler o catálogo, Então a restrição da conta ativa está validada', async () => {
    const { rows } = await db.execute<{ convalidated: boolean }>(
      sql`SELECT convalidated FROM pg_constraint WHERE conname = 'ck_user_accounts_email_hash_conta_ativa'`,
    );

    expect(rows).toEqual([{ convalidated: true }]);
  });

  it('Dada a migração aplicada, Quando listar os índices de user_accounts, Então os índices sobre o e-mail em claro sumiram', async () => {
    const { rows } = await db.execute<{ indexname: string }>(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'user_accounts' AND indexname LIKE '%email%' ORDER BY indexname`,
    );

    expect(rows.map((r) => r.indexname)).toEqual([
      'uq_user_accounts_clinic_email_hash',
      'uq_user_accounts_super_admin_email_hash',
    ]);
  });

  it('Dado o mesmo valor em email com hashes diferentes, Quando gravar, Então grava (a unicidade é só do hash)', async () => {
    await insertConta(db, 'a', 'v1.mesmo', 'b1.k.aa');

    await expect(
      insertConta(db, 'b', 'v1.mesmo', 'b1.k.bb'),
    ).resolves.toBeDefined();
  });
});
