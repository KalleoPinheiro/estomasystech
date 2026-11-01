'use client';

import { startTransition, useActionState } from 'react';
import type { ActionResult } from '@/lib/action-result';

/**
 * Estado de envio de uma Server Action criada com `defineAction` (ADR-069 § 2):
 * `run(entrada)` dispara a ação, `isPending` vale enquanto ela roda e `error`
 * traz a mensagem do último envelope de falha, para o `ErrorAlert`. A tela não
 * busca nada de novo: a ação já chama `refresh()`.
 */
export function useAction<I, R>(
  action: (input: I) => Promise<ActionResult<R>>,
) {
  const [result, dispatch, isPending] = useActionState(
    (_previous: ActionResult<R> | null, input: I) => action(input),
    null,
  );
  return {
    result,
    error: result && !result.success ? result.error : null,
    isPending,
    run: (input: I) => startTransition(() => dispatch(input)),
  };
}
