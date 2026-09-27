import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { describe, expect, it } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');
const TARGET_TAG = '0041_user-accounts-system-role-clinic-check';
const CONSTRAINT = 'ck_user_accounts_system_role_has_no_clinic';

type Db = PgliteDatabase<typeof schema>;

/** Aplica só as migrações anteriores à alvo (mesmo padrão de portal-link-migration). */
async function migrateBefore(db: Db, tag: string): Promise<void> {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-migrate-sa-'));
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

const newDb = (): Db =>
  drizzle(new PGlite({ extensions: { pg_trgm, btree_gist } }), { schema });

const run = (db: Db, statement: string) => db.execute(sql.raw(statement));

const rowsOf = async <T>(db: Db, statement: string): Promise<T[]> =>
  ((await run(db, statement)) as unknown as { rows: T[] }).rows;

/** SQLSTATE e mensagem do erro do Postgres, dentro ou fora do `DrizzleQueryError`. */
function pgErrorOf(error: unknown): { code?: string; message: string } {
  const cause = error instanceof Error ? error.cause : undefined;
  const source = (cause ?? error) as { code?: string; message?: string };
  return { code: source.code, message: String(source.message) };
}

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('esperava erro, mas a operação passou');
}

const SEED_CLINIC = `INSERT INTO clinics (id, name, created_at, created_by)
  VALUES ('c1','Clínica 1',now(),'system')`;

describe('Feature: Um único super_admin garantido pelo banco (B1, ADR-007)', () => {
  describe('Cenário: banco migrado recusa linha inválida (SQLSTATE 23514)', () => {
    it('Dado banco migrado, Quando gravar super_admin com clínica, Então recusa super_admin com clínica', async () => {
      const db = newDb();
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      await run(db, SEED_CLINIC);

      const error = await captureError(() =>
        run(
          db,
          `INSERT INTO user_accounts (id, clinic_id, email, password_hash, role, active, created_at)
           VALUES ('sa-2','c1','sa2@x.com','scrypt$x','super_admin',true,now())`,
        ),
      );

      expect(pgErrorOf(error).code).toBe('23514');
      expect(pgErrorOf(error).message).toContain(CONSTRAINT);
    });

    it('Dado banco migrado, Quando gravar company_admin sem clínica, Então recusa conta de empresa sem clínica', async () => {
      const db = newDb();
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

      const error = await captureError(() =>
        run(
          db,
          `INSERT INTO user_accounts (id, clinic_id, email, password_hash, role, active, created_at)
           VALUES ('ca-1',NULL,'ca@x.com','scrypt$x','company_admin',true,now())`,
        ),
      );

      expect(pgErrorOf(error).code).toBe('23514');
      expect(pgErrorOf(error).message).toContain(CONSTRAINT);
    });

    it('Dado banco migrado, Quando gravar super_admin sem clínica e company_admin com clínica, Então aceita', async () => {
      const db = newDb();
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      await run(db, SEED_CLINIC);

      await run(
        db,
        `INSERT INTO user_accounts (id, clinic_id, email, password_hash, role, active, created_at) VALUES
          ('sa-1',NULL,'sa@x.com','scrypt$x','super_admin',true,now()),
          ('ca-1','c1','ca@x.com','scrypt$x','company_admin',true,now())`,
      );

      expect(
        await rowsOf<{ id: string }>(
          db,
          'SELECT id FROM user_accounts ORDER BY id',
        ),
      ).toEqual([{ id: 'ca-1' }, { id: 'sa-1' }]);
    });
  });

  describe('Cenário: banco antigo com linha inválida', () => {
    it.each([
      [
        'super_admin com clínica',
        `('bad','c1','sa@x.com','scrypt$x','super_admin',true,now())`,
      ],
      [
        'atendente sem clínica',
        `('bad',NULL,'at@x.com','scrypt$x','atendente',true,now())`,
      ],
    ])(
      'Dado %s antes da 0041, Quando migrar, Então falha sem alterar nada e nomeia a constraint',
      async (_label, badRow) => {
        const db = newDb();
        await migrateBefore(db, TARGET_TAG);
        await run(db, SEED_CLINIC);
        await run(
          db,
          `INSERT INTO user_accounts (id, clinic_id, email, password_hash, role, active, created_at) VALUES
            ('ok','c1','ok@x.com','scrypt$x','company_admin',true,now()), ${badRow}`,
        );
        const before = await rowsOf(
          db,
          'SELECT id, clinic_id, role, email FROM user_accounts ORDER BY id',
        );
        const appliedBefore = await rowsOf(
          db,
          'SELECT hash FROM drizzle.__drizzle_migrations',
        );

        const error = await captureError(() =>
          migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
        );

        expect(pgErrorOf(error).message).toContain(CONSTRAINT);
        expect(
          await rowsOf(
            db,
            'SELECT id, clinic_id, role, email FROM user_accounts ORDER BY id',
          ),
        ).toEqual(before);
        expect(
          await rowsOf(
            db,
            `SELECT conname FROM pg_constraint WHERE conname = '${CONSTRAINT}'`,
          ),
        ).toEqual([]);
        expect(
          await rowsOf(db, 'SELECT hash FROM drizzle.__drizzle_migrations'),
        ).toEqual(appliedBefore);
      },
    );
  });
});
