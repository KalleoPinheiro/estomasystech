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
  const result = await call;
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data;
}
