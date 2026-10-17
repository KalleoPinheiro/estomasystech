import { decodeCursor, encodeCursor } from './pagination';

/** Posição na trilha: a mesma chave da ordenação (data desc, id desc) — #322. */
export interface AuditCursor {
  occurredAt: Date;
  id: string;
}

interface AuditCursorPayload {
  occurredAt: string;
  id: string;
}

export function encodeAuditCursor(event: {
  occurredAt: Date | string;
  id: string;
}): string {
  return encodeCursor({
    occurredAt: new Date(event.occurredAt).toISOString(),
    id: event.id,
  } satisfies AuditCursorPayload);
}

/** Cursor ausente, malformado ou com data inválida volta à 1ª página (`null`). */
export function decodeAuditCursor(
  cursor: string | null | undefined,
): AuditCursor | null {
  const payload = decodeCursor<Partial<AuditCursorPayload>>(cursor);
  if (!payload || typeof payload.id !== 'string') return null;
  const occurredAt = new Date(payload.occurredAt ?? Number.NaN);
  if (Number.isNaN(occurredAt.getTime())) return null;
  return { occurredAt, id: payload.id };
}

/** Cursor da próxima página: só existe quando a atual veio cheia. */
export function nextAuditCursor(
  page: { occurredAt: Date | string; id: string }[],
  limit: number,
): string | null {
  if (page.length < limit) return null;
  return encodeAuditCursor(page[page.length - 1]);
}
