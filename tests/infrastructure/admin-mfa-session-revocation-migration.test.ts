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
import type { Session } from '@/lib/auth/session';
import { isSessionRevoked } from '@/lib/auth/staff-revocation';

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');
const TARGET_TAG = '0052_revoke-admin-sessions-without-mfa';

/** Aplica só as migrações anteriores à alvo (mesmo padrão de role-migration-backfill). */
async function migrateBefore(
  db: PgliteDatabase<typeof schema>,
  tag: string,
): Promise<void> {
  const dir = fs.mkdtempSync(
    path.join(process.cwd(), '.tmp-migrate-mfa-sessions-'),
  );
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

describe('Feature: Migração 0052 derruba as sessões de Admin sem 2FA (#309)', () => {
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    db = drizzle(new PGlite({ extensions: { pg_trgm, btree_gist } }), {
      schema,
    });
    await migrateBefore(db, TARGET_TAG);

    await insert(
      db,
      `INSERT INTO clinics (id, name, created_at, created_by) VALUES
        ('c1','Clínica 1',now(),'system')`,
    );
    await insert(
      db,
      `INSERT INTO user_accounts (id, clinic_id, email, password_hash, role, active, created_at, session_version) VALUES
        ('adm-sem','c1','a@x.com','scrypt$x','company_admin',true,now(),3),
        ('adm-com','c1','b@x.com','scrypt$x','company_admin',true,now(),3),
        ('atendente','c1','c@x.com','scrypt$x','atendente',true,now(),3),
        ('paciente','c1','d@x.com','scrypt$x','patient',true,now(),3)`,
    );
    await insert(
      db,
      `INSERT INTO user_mfa (account_id, totp_secret, enrolled_at, last_used_step) VALUES
        ('adm-com','enc',now(),0)`,
    );

    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  });

  it('sobe o session_version só do company_admin sem fator; os demais ficam como estavam', async () => {
    const rows = (await insert(
      db,
      `SELECT id, session_version FROM user_accounts ORDER BY id`,
    )) as unknown as { rows: { id: string; session_version: number }[] };

    expect(rows.rows).toEqual([
      { id: 'adm-com', session_version: 3 },
      { id: 'adm-sem', session_version: 4 },
      { id: 'atendente', session_version: 3 },
      { id: 'paciente', session_version: 3 },
    ]);
  });

  it('a sessão emitida na versão antiga passa a ser revogada pelo mecanismo do ADR-005', async () => {
    const session = {
      subject: 'a@x.com',
      clinicId: 'c1',
      sessionVersion: 3,
    } as unknown as Session;
    const lookup = async () => ({ isActive: true, sessionVersion: 4 });

    expect(await isSessionRevoked(session, lookup, 0)).toBe(true);
  });
});
