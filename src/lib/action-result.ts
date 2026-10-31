import { UNAUTHENTICATED_MESSAGE } from '@/lib/auth/unauthenticated-message';
import { ApiError } from '@/lib/client';
import {
  redirectToLoginOnExpiredSession,
  SESSION_EXPIRED_MESSAGE,
} from '@/lib/login-redirect';

/** Envelope da Server Action: o mesmo `{ success, data, error }` das rotas (ADR-069 § 2). */
export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

/**
 * Desembrulha o envelope de uma Server Action: devolve o dado, ou lança o erro
 * com a MESMA mensagem da falha. Serve a formulários que já mostram o erro de
 * quem lança (`catch` → alerta inline), como faziam com `apiFetch`. Sessão
 * expirada (ação sem sessão) vale o mesmo que o 401 do `apiFetch`: vai ao login
 * com a rota em `next` e lança o `ApiError` 401 que as telas já tratam para
 * guardar o rascunho (#207).
 */
export async function unwrapAction<T>(
  call: Promise<ActionResult<T>>,
): Promise<T> {
  const result = await call;
  if (!result.success) {
    if (
      result.error === UNAUTHENTICATED_MESSAGE &&
      redirectToLoginOnExpiredSession()
    ) {
      throw new ApiError(SESSION_EXPIRED_MESSAGE, 401);
    }
    throw new Error(result.error);
  }
  return result.data;
}
