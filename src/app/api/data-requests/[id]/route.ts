import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  ADMIN_ONLY_MESSAGE,
  ResolveDataSubjectRequest,
} from '@/application/patients/data-subject-requests';
import { MAX_RESOLUTION_LENGTH } from '@/domain/patient/data-subject-request';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toDataSubjectRequestDto } from '@/lib/dto';

const resolveSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  justification: z.string().min(1).max(MAX_RESOLUTION_LENGTH),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Admin aceita ou recusa o pedido, com justificativa; o paciente é avisado
 * por e-mail e vê a resposta no portal (#293). Pedido de outra empresa: `404`.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  if (guard.session && guard.session.role !== 'company_admin') {
    return fail(ADMIN_ONLY_MESSAGE, 403);
  }

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = resolveSchema.parse(await request.json());
    const services = await getRepositories(writeScope(guard.session));
    const useCase = new ResolveDataSubjectRequest(
      services.dataSubjectRequests,
      services.patients,
      services.email,
    );
    const decided = await useCase.prepare({ requestId: id, ...body });

    // Write-ahead: a decisão só é gravada (e o paciente avisado) com trilha.
    await recordAuditNow(services.auditEvents, guard.session, {
      action: 'update',
      resourceType: 'data_request',
      resourceId: decided.id,
      patientId: decided.patientId,
      detail: `${decided.kind}: ${decided.status}`,
    });
    const { request: resolved, notified } = await useCase.commit(decided);
    return { ...toDataSubjectRequestDto(resolved), notified };
  });
}
