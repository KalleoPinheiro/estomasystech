import type { AuditEvent } from '@/domain/audit/audit-event';

export interface AuditEventDto {
  id: string;
  actorRole: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  patientId: string | null;
  /** Nome resolvido no servidor (#197) — a tela não depende de lista de pacientes. */
  patientName?: string | null;
  detail: string | null;
  occurredAt: string;
}

export const toAuditEventDto = (
  event: AuditEvent,
  patientName?: string | null,
): AuditEventDto => ({
  id: event.id,
  actorRole: event.actorRole,
  actorId: event.actorId,
  action: event.action,
  resourceType: event.resourceType,
  resourceId: event.resourceId,
  patientId: event.patientId,
  ...(patientName === undefined ? {} : { patientName }),
  detail: event.detail,
  occurredAt: event.occurredAt.toISOString(),
});
