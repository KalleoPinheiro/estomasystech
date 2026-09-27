import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { listOrphanPortalAccounts } from '@/infrastructure/persistence/drizzle/portal-orphans';
import * as schema from '@/infrastructure/persistence/drizzle/schema';

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');
const TARGET_TAG = '0040_portal-account-link';

/** Aplica só as migrações anteriores à alvo (mesmo padrão de role-migration-backfill). */
async function migrateBefore(
  db: PgliteDatabase<typeof schema>,
  tag: string,
): Promise<void> {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-migrate-portal-'));
  const meta = path.join(dir, 'meta');
  fs.mkdirSync(meta);
  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
  );
  const targetIdx = journal.entries.find(
    (e: { tag: string }) => e.tag === tag,
  ).idx;
  journal.entries = journal.entries.filter(
    (e: { idx: number }) => e.idx < targetIdx,
  );
  fs.writeFileSync(path.join(meta, '_journal.json'), JSON.stringify(journal));
  for (const entry of journal.entries) {
    const snapshot = `${String(entry.idx).padStart(4, '0')}_snapshot.json`;
    fs.copyFileSync(
      path.join(MIGRATIONS_DIR, 'meta', snapshot),
      path.join(meta, snapshot),
    );
    fs.copyFileSync(
      path.join(MIGRATIONS_DIR, `${entry.tag}.sql`),
      path.join(dir, `${entry.tag}.sql`),
    );
  }
  try {
    await migrate(db, { migrationsFolder: dir });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const insert = (db: PgliteDatabase<typeof schema>, statement: string) =>
  db.execute(sql.raw(statement));

describe('Feature: Migração 0040 vincula contas de portal ao cadastro (#196)', () => {
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    db = drizzle(new PGlite({ extensions: { pg_trgm, btree_gist } }), {
      schema,
    });
    await migrateBefore(db, TARGET_TAG);

    await insert(
      db,
      `INSERT INTO clinics (id, name, created_at, created_by) VALUES
        ('c1','Clínica 1',now(),'system'), ('c2','Clínica 2',now(),'system')`,
    );
    await insert(
      db,
      `INSERT INTO patients (id, clinic_id, full_name, email, phone, created_at) VALUES
        ('pat-1','c1','Ana','ana@x.com','1',now()),
        ('pat-2','c2','Ana Outra Empresa','orfa@x.com','1',now())`,
    );
    await insert(
      db,
      `INSERT INTO partners (id, clinic_id, full_name, email, phone, created_at) VALUES
        ('par-1','c1','Dr. Carlos','carlos@x.com','1',now())`,
    );
    await insert(
      db,
      `INSERT INTO user_accounts (id, clinic_id, email, password_hash, role, active, created_at) VALUES
        ('acc-ana','c1','Ana@X.com','scrypt$x','patient',true,now()),
        ('acc-orfa','c1','orfa@x.com','scrypt$x','patient',true,now()),
        ('acc-carlos','c1','carlos@x.com','scrypt$x','partner',true,now()),
        ('acc-staff','c1','ana@x.com.br','scrypt$x','atendente',true,now())`,
    );

    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  });

  it('backfill links by email: mesma empresa, sem diferenciar maiúsculas; e-mail só de outra empresa fica órfão', async () => {
    const rows = (await insert(
      db,
      `SELECT id, patient_id, partner_id FROM user_accounts ORDER BY id`,
    )) as unknown as {
      rows: {
        id: string;
        patient_id: string | null;
        partner_id: string | null;
      }[];
    };

    expect(rows.rows).toEqual([
      { id: 'acc-ana', patient_id: 'pat-1', partner_id: null },
      { id: 'acc-carlos', patient_id: null, partner_id: 'par-1' },
      { id: 'acc-orfa', patient_id: null, partner_id: null },
      { id: 'acc-staff', patient_id: null, partner_id: null },
    ]);
  });

  it('orphan report: lista só contas patient/partner sem vínculo', async () => {
    const orphans = await listOrphanPortalAccounts(db as unknown as AppDb);

    expect(orphans).toEqual([
      {
        id: 'acc-orfa',
        clinicId: 'c1',
        email: 'orfa@x.com',
        role: 'patient',
        active: true,
      },
    ]);
  });
});
