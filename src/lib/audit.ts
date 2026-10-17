import { after } from 'next/server';
import { type AuditAction, AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { Session } from '@/lib/auth/session';
import { logError } from '@/lib/log-error';

export interface AuditActorOverride {
  role: string;
  id: string;
  clinicId: string | null;
}

export interface AuditInput {
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  patientId?: string | null;
  detail?: string | null;
  /**
   * Empresa do evento, quando o super_admin age sobre uma clínica (B4/B5): a
   * clínica-alvo. Nos demais casos resolve sozinho a partir do ator; sem
   * empresa, o evento é de plataforma (`null`, B6). O repositório escopado
   * recusa empresa diferente da sua.
   */
  clinicId?: string | null;
  /**
   * Ator explícito para rotas que autenticam mas ainda não têm `Session`
   * (login, set-password). Quando presente, sobrepõe o ator/empresa
   * derivados de `session`.
   */
  actorOverride?: AuditActorOverride;
}

/**
 * Registra evento de auditoria após a resposta (after()), best-effort:
 * falha de auditoria nunca falha o request — é logada no servidor.
 * Sem sessão (login, cron, bootstrap), registra ator "anonymous" para não perder a trilha.
 */
export function recordAudit(
  auditEvents: AuditEventRepository,
  session: Session | null,
  input: AuditInput,
): void {
  after(async () => {
    try {
      await persistAuditEvent(auditEvents, session, input);
    } catch (error) {
      logError('Auditoria: falha ao registrar evento', error);
    }
  });
}

/**
 * Variante write-ahead para ações críticas (exportação LGPD, exclusão de foto):
 * o evento é persistido ANTES da resposta e uma falha de auditoria falha a
 * requisição — sucesso silencioso sem trilha não é aceitável nesses fluxos.
 */
export async function recordAuditNow(
  auditEvents: AuditEventRepository,
  session: Session | null,
  input: AuditInput,
): Promise<void> {
  await persistAuditEvent(auditEvents, session, input);
}

async function persistAuditEvent(
  auditEvents: AuditEventRepository,
  session: Session | null,
  input: AuditInput,
): Promise<void> {
  const resolved = resolveActor(input.actorOverride, session);
  await auditEvents.save(
    AuditEvent.create({
      clinicId: input.clinicId ?? resolved.clinicId,
      actorRole: resolved.role,
      actorId: resolved.id,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      patientId: input.patientId ?? null,
      detail: input.detail ?? null,
    }),
  );
}

function resolveActor(
  actorOverride: AuditActorOverride | undefined,
  session: Session | null,
): { role: string; id: string; clinicId: string | null } {
  // Sem empresa não há fallback para a clínica legada (#210): o evento é de
  // plataforma, ou ganha a clínica do repositório escopado que o grava.
  if (actorOverride) return actorOverride;
  return {
    role: session?.role ?? 'anonymous',
    id: session?.subject ?? 'anonymous',
    clinicId: session?.clinicId ?? null,
  };
}
