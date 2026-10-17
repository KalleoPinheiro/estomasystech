import type { AuditEvent } from './audit-event';

/**
 * Filtro da trilha. A empresa não é filtro: vem do escopo com que o repositório
 * foi montado (AD-017, #210 item 4).
 */
export interface AuditEventFilter {
  patientId?: string;
  from?: Date;
  to?: Date;
  /** Usado pela emissão de documentos (#94) pra achar um registro já existente. */
  resourceType?: string;
  resourceId?: string;
}

export interface AuditEventPage {
  limit?: number;
  /**
   * Cursor opaco (#322): retoma estritamente depois do último evento da página
   * anterior, na ordem (data, id) decrescente. Sem `offset`: o custo da página
   * não cresce com a profundidade e evento novo não duplica nem pula linha.
   */
  cursor?: string;
}

/** Período da trilha de plataforma. */
export interface PlatformTrailFilter {
  from?: Date;
  to?: Date;
}

export const FOREIGN_CLINIC_EVENT = 'Evento de auditoria de outra empresa';
export const PLATFORM_TRAIL_NEEDS_SYSTEM_SCOPE =
  'Trilha de plataforma exige escopo de sistema';

/**
 * Append-only: sem update nem delete — integridade da trilha.
 *
 * Escopado por empresa (B6): em escopo de clínica, `findAll` só vê a clínica e
 * `save` grava nela o evento sem empresa (ação do super_admin na clínica-alvo)
 * e recusa evento de outra; em escopo de sistema, grava a empresa do evento
 * (inclusive `null` = plataforma) e lê tudo.
 */
export interface AuditEventRepository {
  save(event: AuditEvent): Promise<void>;
  findAll(
    filter?: AuditEventFilter,
    page?: AuditEventPage,
  ): Promise<AuditEvent[]>;
  /**
   * Trilha de plataforma: eventos sem empresa ou do super_admin (inclusive os
   * dele numa clínica). Só em escopo de sistema — em escopo de clínica lança.
   */
  findPlatformTrail(
    filter?: PlatformTrailFilter,
    page?: AuditEventPage,
  ): Promise<AuditEvent[]>;
}

/** Empresa com que o evento é gravado num repositório de escopo `scope`. */
export function clinicIdForSave(
  scope: string | null,
  event: AuditEvent,
): string | null {
  if (scope === null) return event.clinicId;
  if (event.clinicId !== null && event.clinicId !== scope) {
    throw new Error(FOREIGN_CLINIC_EVENT);
  }
  return scope;
}
