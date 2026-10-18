/**
 * Contadores em memória dos sinais de alerta (#212): erro 5xx do servidor e
 * falha de entrega de e-mail. Um processo só (uma réplica, #206); reinício
 * zera a contagem. Ficam em `globalThis` porque o Next compila o
 * `instrumentation.ts` e as rotas em bundles separados — um módulo comum
 * teria uma cópia em cada.
 */
export type SignalKind = 'server-error' | 'delivery-failure';

/** Guarda no máximo uma hora de eventos: a janela de alerta é menor. */
const RETENTION_MS = 60 * 60_000;

const globalForSignals = globalThis as unknown as {
  estomasystechSignals?: Record<SignalKind, number[]>;
};

function store(): Record<SignalKind, number[]> {
  globalForSignals.estomasystechSignals ??= {
    'server-error': [],
    'delivery-failure': [],
  };
  return globalForSignals.estomasystechSignals;
}

export function recordSignal(kind: SignalKind, nowMs = Date.now()): void {
  const events = store()[kind];
  events.push(nowMs);
  const cutoff = nowMs - RETENTION_MS;
  while (events.length > 0 && events[0] < cutoff) {
    events.shift();
  }
}

/** Quantos eventos de `kind` aconteceram a partir de `sinceMs`. */
export function countSignals(kind: SignalKind, sinceMs: number): number {
  return store()[kind].filter((at) => at >= sinceMs).length;
}

/** Para o teste. */
export function resetSignals(): void {
  globalForSignals.estomasystechSignals = undefined;
}
