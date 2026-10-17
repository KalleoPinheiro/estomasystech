import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { OpenDataSubjectRequest } from '@/application/patients/data-subject-requests';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import {
  DATA_REQUEST_KINDS,
  MAX_DETAILS_LENGTH,
} from '@/domain/patient/data-subject-request';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requirePortalSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toDataSubjectRequestDto } from '@/lib/dto';

const openSchema = z.object({
  kind: z.enum(DATA_REQUEST_KINDS),
  details: z.string().max(MAX_DETAILS_LENGTH).nullish(),
});

/** Pedidos do próprio titular, com a resposta da clínica (#293). */
export async function GET(request: NextRequest) {
  const auth = requirePortalSession(request, 'patient');
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const repos = await getRepositories(sessionScope(auth.session));
    const patient = await resolvePortalPatient(repos, auth.session);
    const requests = await repos.dataSubjectRequests.findByPatient(patient.id);
    return requests.map((item) => toDataSubjectRequestDto(item));
  });
}

/**
 * Pedido de correção cadastral ou de eliminação/anonimização (LGPD art. 18).
 * Vai para a fila do Admin; nada muda no cadastro até a análise.
 */
export async function POST(request: NextRequest) {
  const auth = requirePortalSession(request, 'patient');
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const body = openSchema.parse(await request.json());
    const repos = await getRepositories(writeScope(auth.session));
    const patient = await resolvePortalPatient(repos, auth.session);
    const useCase = new OpenDataSubjectRequest(
      repos.dataSubjectRequests,
      repos.userAccounts,
      repos.email,
    );
    const created = await useCase.prepare({ ...body, patientId: patient.id });

    // Write-ahead: pedido de direito do titular sem trilha não é gravado.
    await recordAuditNow(repos.auditEvents, auth.session, {
      action: 'create',
      resourceType: 'data_request',
      resourceId: created.id,
      patientId: patient.id,
      detail: created.kind,
    });
    await useCase.commit(created);
    return toDataSubjectRequestDto(created);
  });
}
