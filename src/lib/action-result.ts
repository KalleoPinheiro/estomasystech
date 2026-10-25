/** Envelope da Server Action: o mesmo `{ success, data, error }` das rotas (ADR-069 § 2). */
export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

/**
 * Desembrulha o envelope para quem trata o erro com `try/catch` (um formulário
 * que mostra o `ErrorAlert` e mantém o modal aberto): sucesso devolve o dado,
 * falha lança `Error` com a mensagem do servidor.
 */
export async function unwrapAction<T>(
  pending: Promise<ActionResult<T>>,
): Promise<T> {
  const result = await pending;
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data;
}
