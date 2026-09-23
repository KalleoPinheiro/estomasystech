interface WindowState {
  count: number;
  resetAtMs: number;
}

/**
 * Rate limiter de janela fixa em memória (por instância). Fica no limite
 * global da API (`proxy.ts`), que é só proteção contra rajada: com N réplicas
 * o teto efetivo é N × o configurado. Endpoints de autenticação usam o
 * `SharedRateLimiter`, exato entre réplicas.
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
  /** Conta um acesso e devolve quantos já houve na janela corrente. */
  hit(key: string, windowMs: number, nowMs: number): Promise<number>;
  prune(nowMs: number): Promise<void>;
}

async function defaultStore(): Promise<RateLimitStore> {
  const [{ getDb }, { DrizzleRateLimitStore }] = await Promise.all([
    import('@/infrastructure/persistence/drizzle/db'),
    import('@/infrastructure/persistence/drizzle/drizzle-rate-limit-store'),
  ]);
  return new DrizzleRateLimitStore(await getDb());
}

/**
 * Rate limit dos endpoints de autenticação (login, esqueci a senha, definir
 * senha, bootstrap) contado no banco — com várias réplicas, a força bruta não
 * ganha N × tentativas (issue #77). Se o banco falhar, cai no limiter em
 * memória desta réplica em vez de liberar tudo.
 */
export class SharedRateLimiter {
  private readonly fallback: RateLimiter;
  private lastPruneMs = 0;

  constructor(
    private readonly name: string,
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly store: () => Promise<RateLimitStore> = defaultStore,
  ) {
    this.fallback = new RateLimiter(maxRequests, windowMs);
  }

  /** Retorna true se a requisição está dentro do limite. */
  async allow(key: string, nowMs: number = Date.now()): Promise<boolean> {
    try {
      const store = await this.store();
      const count = await store.hit(
        `${this.name}:${key}`,
        this.windowMs,
        nowMs,
      );
      await this.pruneIfStale(store, nowMs);
      return count <= this.maxRequests;
    } catch (error) {
      console.error(
        `Rate limit ${this.name}: falha no contador compartilhado — usando o da réplica`,
        error,
      );
      return this.fallback.allow(key, nowMs);
    }
  }

  private async pruneIfStale(store: RateLimitStore, nowMs: number) {
    if (nowMs - this.lastPruneMs < this.windowMs) {
      return;
    }
    this.lastPruneMs = nowMs;
    await store.prune(nowMs);
  }
}
