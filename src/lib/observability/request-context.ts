import { AsyncLocalStorage } from 'node:async_hooks';
import { headers } from 'next/headers';
import { isValidRequestId, REQUEST_ID_HEADER } from './request-id';

/**
 * Onde o logger acha o id da requisição corrente (#212):
 * 1. contexto aberto pelo proxy (`runWithRequestId`), que não é um handler;
 * 2. cabeçalho `x-request-id` que o proxy repassou ao handler, lido por
 *    `headers()` — vale em route handler, server component e `after()` de
 *    route handler;
 * 3. fora de requisição (boot, script, teste) não há id.
 */
const storage = new AsyncLocalStorage<{ requestId: string }>();

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

function requestHeaders(): Promise<Headers> | null {
  try {
    return headers() as Promise<Headers>;
  } catch {
    return null;
  }
}

/**
 * Entrega o id a `use`. Síncrono quando dá para saber na hora (proxy ou fora
 * de requisição), para a linha de log não depender de microtask — o erro
 * fatal do boot é logado logo antes de `process.exit`.
 */
export function withRequestId(use: (requestId?: string) => void): void {
  const fromProxy = storage.getStore()?.requestId;
  if (fromProxy) {
    use(fromProxy);
    return;
  }
  const pending = requestHeaders();
  if (!pending) {
    use(undefined);
    return;
  }
  pending.then(
    (list) => {
      const id = list.get(REQUEST_ID_HEADER);
      use(isValidRequestId(id) ? (id as string) : undefined);
    },
    () => use(undefined),
  );
}
