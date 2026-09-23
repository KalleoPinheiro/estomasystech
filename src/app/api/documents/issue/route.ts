import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuditEvent } from '@/domain/audit/audit-event';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';

const DOCUMENT_TYPES = [
  'atestado',
  'consentimento',
  'plano-cuidados',
  'relatorio',
] as const;

const NUMBER_PREFIX: Record<(typeof DOCUMENT_TYPES)[number], string> = {
  atestado: 'ATST',
  consentimento: 'TCLE',
  'plano-cuidados': 'PLAN',
  relatorio: 'REL',
};

const issueSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  resourceId: z.string().min(1).max(200),
});

/**
 * Emissão persistida de documento clínico (#94, DOC-01): resolve "a data do
 * documento é `new Date()` no render" reaproveitando a trilha de auditoria já
 * existente — reimprimir o mesmo `documentType`+`resourceId` devolve o mesmo
 * registro (idempotente), em vez de gerar uma data nova a cada Ctrl+P.
 */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = issueSchema.parse(await request.json());
    const clinicId = writeClinicId(guard.session);
    const { auditEvents } = await getRepositories(clinicScope(clinicId));

    const existing = await auditEvents.findAll({
      resourceType: body.documentType,
      resourceId: body.resourceId,
    });
    const event =
      existing[0] ??
      (await (async () => {
        const created = AuditEvent.create({
          clinicId,
          actorRole: guard.session?.role ?? 'anonymous',
          actorId: guard.session?.subject ?? 'anonymous',
          action: 'create',
          resourceType: body.documentType,
          resourceId: body.resourceId,
          detail: 'emissão de documento',
        });
        await auditEvents.save(created);
        return created;
      })());

    return {
      documentNumber: `${NUMBER_PREFIX[body.documentType]}-${event.id.slice(0, 8).toUpperCase()}`,
      issuedAt: event.occurredAt.toISOString(),
    };
  });
}
