/**
 * Linhas do logger estruturado (#212) capturadas por um `vi.spyOn(console, …)`:
 * cada chamada é uma string JSON.
 */
export interface LoggedLine {
  level: string;
  msg: string;
  requestId?: string;
  [field: string]: unknown;
}

export function loggedLines(spy: {
  mock: { calls: unknown[][] };
}): LoggedLine[] {
  return spy.mock.calls.map(([line]) => JSON.parse(String(line)) as LoggedLine);
}
