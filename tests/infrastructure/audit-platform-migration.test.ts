import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

type Db = PgliteDatabase<typeof schema>;

/** SQLSTATE do erro do Postgres, dentro ou fora do `DrizzleQueryError`. */
function pgCodeOf(error: unknown): string | undefined {
  const cause = error instanceof Error ? error.cause : undefined;
  return ((cause ?? error) as { code?: string }).code;
}

const insertEvent = (db: Db, id: string, clinicId: string | null) =>
  db.execute(
    sql`INSERT INTO audit_events (id, clinic_id, actor_role, actor_id, action, resource_type, resource_id, occurred_at)
        VALUES (${id}, ${clinicId}, 'anonymous', 'x@y.test', 'read', 'session', 'x@y.test', now())`,
  );

describe('Feature: Evento de plataforma no banco (B6, migração 0045)', () => {
  let db: Db;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
  });

  it('Dada a migração, Quando gravar evento com clinic_id nulo, Então aceita; e clínica inexistente continua recusada pela FK', async () => {
    await insertEvent(db, 'ev-platform', null);
    const rows = (await db.execute(
      sql`SELECT clinic_id FROM audit_events WHERE id = 'ev-platform'`,
    )) as unknown as { rows: Record<string, unknown>[] };
    expect(rows.rows).toEqual([{ clinic_id: null }]);

    const error = await insertEvent(
      db,
      'ev-ghost',
      'clinica-que-nao-existe',
    ).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(pgCodeOf(error)).toBe('23503');
  });
});
