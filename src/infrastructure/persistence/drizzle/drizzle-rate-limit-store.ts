import { lt, sql } from 'drizzle-orm';
import type { RateLimitStore } from '@/lib/auth/rate-limit';
import type { AppDb } from './db';
import { rateLimitWindows } from './schema';

/**
 * Janela fixa no Postgres, compartilhada entre réplicas (issue #77). Um único
 * upsert atômico conta o acesso: requisições simultâneas de réplicas
 * diferentes nunca perdem incremento.
 */
export class DrizzleRateLimitStore implements RateLimitStore {
  constructor(private readonly db: AppDb) {}

  async hit(key: string, windowMs: number, nowMs: number): Promise<number> {
    const now = new Date(nowMs);
    const resetAt = new Date(nowMs + windowMs);
    const expired = sql`${rateLimitWindows.resetAt} <= ${now.toISOString()}::timestamptz`;
    const [row] = await this.db
      .insert(rateLimitWindows)
      .values({ key, count: 1, resetAt })
      .onConflictDoUpdate({
        target: rateLimitWindows.key,
        set: {
          count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimitWindows.count} + 1 END`,
          resetAt: sql`CASE WHEN ${expired} THEN excluded.reset_at ELSE ${rateLimitWindows.resetAt} END`,
        },
      })
      .returning({ count: rateLimitWindows.count });
    return row.count;
  }

  /** Apaga janelas vencidas — chamada de tempos em tempos, não a cada acesso. */
  async prune(nowMs: number): Promise<void> {
    await this.db
      .delete(rateLimitWindows)
      .where(lt(rateLimitWindows.resetAt, new Date(nowMs)));
  }
}
