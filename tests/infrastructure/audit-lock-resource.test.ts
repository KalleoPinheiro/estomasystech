import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAuditEventRepository } from '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import { createPgliteFromTemplate } from '../support/pglite-template';

describe('Feature: trava da emissão por documento (#546, ADR-082)', () => {
  it('Dada a transação aberta, Quando travar o mesmo documento duas vezes, Então a mesma transação segue (a trava é reentrante)', async () => {
    const db = drizzle(await createPgliteFromTemplate(), {
      schema,
    }) as unknown as AppDb;

    const done = await db.transaction(async (tx) => {
      const repo = new DrizzleAuditEventRepository(
        tx as unknown as AppDb,
        'clinica-a',
      );
      await repo.lockResource('atestado', 'apt-1');
      await repo.lockResource('atestado', 'apt-1');
      const held = await tx.execute(
        sql`select count(*)::int as n from pg_locks where locktype = 'advisory'`,
      );
      return held.rows[0] as { n: number };
    });

    expect(done.n).toBeGreaterThanOrEqual(1);
  });

  it('Dado o escopo de sistema, Quando travar, Então não falha (a chave não leva empresa)', async () => {
    const db = drizzle(await createPgliteFromTemplate(), {
      schema,
    }) as unknown as AppDb;

    await expect(
      new DrizzleAuditEventRepository(db, null).lockResource('recibo', 'p-1'),
    ).resolves.toBeUndefined();
  });

  it('Dada a memória, Quando travar, Então não há o que esperar', async () => {
    await expect(
      new InMemoryAuditEventRepository().lockResource(),
    ).resolves.toBeUndefined();
  });
});
