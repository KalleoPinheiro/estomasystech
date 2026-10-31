import {
  redirectToLoginOnExpiredSession,
  SESSION_EXPIRED_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from './login-redirect';

/** Envelope da Server Action: o mesmo `{ success, data, error }` das rotas (ADR-069 § 2). */
export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

/**
 * Desembrulha o envelope de uma Server Action: devolve o dado, ou lança o erro
 * com a MESMA mensagem da falha. Serve a formulários que já mostram o erro de
 * quem lança (`catch` → alerta inline), como faziam com `apiFetch`.
 */
export async function unwrapAction<T>(
  call: Promise<ActionResult<T>>,
): Promise<T> {
  let result: ActionResult<T>;
  try {
    result = await call;
  } catch (error) {
    // Sem sessão, o proxy redireciona o POST da ação ao login e o Next lança
    // "An unexpected response was received from the server": é sessão
    // expirada, não erro genérico (#207). Falha de rede segue como veio.
    if (UNEXPECTED_RESPONSE.test(String((error as Error)?.message))) {
      throw expiredSession();
    }
    throw error;
  }
  if (!result.success) {
    throw result.error === UNAUTHENTICATED_MESSAGE
      ? expiredSession()
      : new Error(result.error);
  }
  return result.data;
}

const UNEXPECTED_RESPONSE = /unexpected response/i;

/** Leva ao login com a rota atual em `next`; o erro mostra a mesma mensagem do `apiFetch`. */
function expiredSession(): Error {
  redirectToLoginOnExpiredSession();
  return new Error(SESSION_EXPIRED_MESSAGE);
}
