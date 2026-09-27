import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

type Db = PgliteDatabase<typeof schema>;

/** SQLSTATE e mensagem do erro do Postgres, dentro ou fora do `DrizzleQueryError`. */
function pgErrorOf(error: unknown): { code?: string; message: string } {
  const cause = error instanceof Error ? error.cause : undefined;
  const source = (cause ?? error) as { code?: string; message?: string };
  return { code: source.code, message: String(source.message) };
}

describe('Feature: Estado da clínica (B5, migração 0044)', () => {
  let db: Db;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
  });

  it('Dada a migração, Quando ler e gravar o estado da clínica no banco, Então default active, colunas de mudança nulas e valor fora do domínio recusado', async () => {
    await db.execute(
      sql`INSERT INTO clinics (id, name, created_at, created_by) VALUES ('st-1', 'Clínica st-1', now(), 'system')`,
    );
    const rows = (await db.execute(
      sql`SELECT status, status_changed_at, status_changed_by FROM clinics WHERE id IN ('st-1', 'legacy-clinic') ORDER BY id`,
    )) as unknown as { rows: Record<string, unknown>[] };
    expect(rows.rows).toEqual([
      { status: 'active', status_changed_at: null, status_changed_by: null },
      { status: 'active', status_changed_at: null, status_changed_by: null },
    ]);

    const error = await db
      .execute(sql`UPDATE clinics SET status = 'outro' WHERE id = 'st-1'`)
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(pgErrorOf(error).code).toBe('23514');
    expect(pgErrorOf(error).message).toContain('clinics_status_check');
  });
});
