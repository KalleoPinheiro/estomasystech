/** Resposta de `GET /api/version` (ADR-066); `sha` só existe em homologação. */
export interface AppVersionDto {
  version: string;
  releasedAt: string | null;
  sha?: string;
}
