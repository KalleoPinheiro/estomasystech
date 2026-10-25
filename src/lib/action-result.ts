/** Envelope da Server Action: o mesmo `{ success, data, error }` das rotas (ADR-069 § 2). */
export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };
