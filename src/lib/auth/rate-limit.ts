interface WindowState {
  count: number;
  resetAtMs: number;
}

/**
 * Rate limiter de janela fixa em memória (por instância). Sozinho, só serve de
 * reserva: com várias réplicas cada uma teria o próprio teto. O rate limit de
 * verdade é o `SharedRateLimiter`, contado no Postgres.
 */
const PRUNE_SIZE_THRESHOLD = 10_000;

export class RateLimiter {
  private readonly windows = new Map<string, WindowState>();
  private lastPruneMs = 0;

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  /** Retorna true se a requisição está dentro do limite. */
  allow(key: string, nowMs: number = Date.now()): boolean {
    const state = this.windows.get(key);
    if (!state || nowMs >= state.resetAtMs) {
      this.windows.set(key, { count: 1, resetAtMs: nowMs + this.windowMs });
      this.pruneIfNeeded(nowMs);
      return true;
    }
    if (state.count >= this.maxRequests) {
      return false;
    }
    this.windows.set(key, { ...state, count: state.count + 1 });
    return true;
  }

  /** Poda por tamanho ou por tempo — chaves únicas em rajada não seguram memória por horas. */
  private pruneIfNeeded(nowMs: number): void {
    const isOversized = this.windows.size > PRUNE_SIZE_THRESHOLD;
    const isStale = nowMs - this.lastPruneMs >= this.windowMs;
    if (!isOversized && !isStale) {
      return;
    }
    this.lastPruneMs = nowMs;
    for (const [key, state] of this.windows) {
      if (nowMs >= state.resetAtMs) {
        this.windows.delete(key);
      }
    }
  }
}

/** Contador de janela fixa compartilhado (Postgres em produção). */
export interface RateLimitStore {
  /** Soma `amount` acessos e devolve o total da janela corrente. */
  hit(
    key: string,
    windowMs: number,
    nowMs: number,
    amount?: number,
  ): Promise<number>;
  prune(nowMs: number): Promise<void>;
}

async function defaultStore(): Promise<RateLimitStore> {
  const [{ getDb }, { DrizzleRateLimitStore }] = await Promise.all([
    import('@/infrastructure/persistence/drizzle/db'),
    import('@/infrastructure/persistence/drizzle/drizzle-rate-limit-store'),
  ]);
  return new DrizzleRateLimitStore(await getDb());
}

interface SyncState {
  /** Total da janela visto no banco na última sincronização. */
  total: number;
  /** Acessos desta réplica ainda não enviados ao banco. */
  pending: number;
  syncDueMs: number;
}

/**
 * Rate limit contado no Postgres, compartilhado entre réplicas (issue #77).
 *
 * `syncEveryMs = 0` (padrão): cada acesso vai ao banco — exato; usado nos
 * endpoints de autenticação, de baixo volume. `syncEveryMs > 0`: a réplica
 * conta localmente e manda o acumulado ao banco no máximo uma vez por
 * intervalo por chave, somando ao total global — usado no limite geral da API
 * para não gravar no banco a cada request. A deriva fica limitada ao tráfego
 * de um intervalo por réplica.
 *
 * Se o banco falhar, vale o limiter em memória desta réplica, nunca libera tudo.
 */
export class SharedRateLimiter {
  private readonly fallback: RateLimiter;
  private readonly local = new Map<string, SyncState>();
  private lastPruneMs = 0;

  constructor(
    private readonly name: string,
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly store: () => Promise<RateLimitStore> = defaultStore,
    private readonly syncEveryMs = 0,
  ) {
    this.fallback = new RateLimiter(maxRequests, windowMs);
  }

  /** Retorna true se a requisição está dentro do limite. */
  async allow(key: string, nowMs: number = Date.now()): Promise<boolean> {
    const fullKey = `${this.name}:${key}`;
    const state = this.local.get(fullKey);
    if (state && nowMs < state.syncDueMs) {
      state.pending += 1;
      return state.total + state.pending <= this.maxRequests;
    }
    try {
      return await this.sync(fullKey, (state?.pending ?? 0) + 1, nowMs);
    } catch (error) {
      console.error(
        `Rate limit ${this.name}: falha no contador compartilhado — usando o da réplica`,
        error,
      );
      return this.fallback.allow(key, nowMs);
    }
  }

  private async sync(
    fullKey: string,
    amount: number,
    nowMs: number,
  ): Promise<boolean> {
    const store = await this.store();
    const total = await store.hit(fullKey, this.windowMs, nowMs, amount);
    if (this.syncEveryMs > 0) {
      this.local.set(fullKey, {
        total,
        pending: 0,
        syncDueMs: nowMs + this.syncEveryMs,
      });
    }
    await this.pruneIfStale(store, nowMs);
    return total <= this.maxRequests;
  }

  /** Poda janelas vencidas no banco e chaves paradas na memória, 1× por janela. */
  private async pruneIfStale(store: RateLimitStore, nowMs: number) {
    if (nowMs - this.lastPruneMs < this.windowMs) {
      return;
    }
    this.lastPruneMs = nowMs;
    for (const [key, state] of this.local) {
      if (nowMs - state.syncDueMs >= this.windowMs) {
        this.local.delete(key);
      }
    }
    await store.prune(nowMs);
  }
}
