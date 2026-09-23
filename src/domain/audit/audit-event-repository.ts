import type { AuditEvent } from './audit-event';

export interface AuditEventFilter {
  /** Escopo por empresa — ausente só na visão cross-empresa do papel de sistema. */
  clinicId?: string;
  patientId?: string;
  from?: Date;
  to?: Date;
  /** Usado pela emissão de documentos (#94) pra achar um registro já existente. */
  resourceType?: string;
  resourceId?: string;
}

export interface AuditEventPage {
  limit?: number;
  offset?: number;
}

/** Append-only: sem update nem delete — integridade da trilha. */
export interface AuditEventRepository {
  save(event: AuditEvent): Promise<void>;
  findAll(
    filter?: AuditEventFilter,
    page?: AuditEventPage,
  ): Promise<AuditEvent[]>;
}
