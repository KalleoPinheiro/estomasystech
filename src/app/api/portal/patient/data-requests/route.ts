import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { OpenDataSubjectRequest } from '@/application/patients/data-subject-requests';
import {
  ADULT_TITULAR_ONLY_MESSAGE,
  resolveConsentSigner,
} from '@/application/portal/portal-identity';
import {
  DATA_REQUEST_KINDS,
  MAX_DETAILS_LENGTH,
} from '@/domain/patient/data-subject-request';
import { ForbiddenError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toDataSubjectRequestDto } from '@/lib/dto';

export const MINOR_ERASURE_AT_CLINIC_MESSAGE =
  'A eliminação dos dados do menor é pedida diretamente à clínica.';

const openSchema = z.object({
  kind: z.enum(DATA_REQUEST_KINDS),
  details: z.string().max(MAX_DETAILS_LENGTH).nullish(),
});

/** Pedidos do titular (ou do representante do menor, #375), com a resposta da clínica (#293). */
export async function GET(request: NextRequest) {
  const auth = requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const repos = await getRepositories(sessionScope(auth.session));
    const { patient } = await resolveConsentSigner(
      repos,
      auth.session,
      ADULT_TITULAR_ONLY_MESSAGE,
    );
    const requests = await repos.dataSubjectRequests.findByPatient(patient.id);
    return requests.map((item) => toDataSubjectRequestDto(item));
  });
}

/**
 * Pedido de correção cadastral ou de eliminação/anonimização (LGPD art. 18).
 * Vai para a fila do Admin; nada muda no cadastro até a análise. O
 * representante do menor pede correção; a eliminação é só na clínica (#375).
 */
export async function POST(request: NextRequest) {
  const auth = requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const repos = await getRepositories(writeScope(auth.session));
    // Quem pode pedir vem antes do corpo: responsável de adulto recebe 403
    // mesmo com o pedido malformado.
    const { patient, signer } = await resolveConsentSigner(
      repos,
      auth.session,
      ADULT_TITULAR_ONLY_MESSAGE,
    );
    const body = openSchema.parse(await request.json());
    if (signer && body.kind === 'erasure') {
      throw new ForbiddenError(MINOR_ERASURE_AT_CLINIC_MESSAGE);
    }
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
      detail: signer
        ? `${created.kind} · pelo representante legal`
        : created.kind,
    });
    await useCase.commit(created);
    return toDataSubjectRequestDto(created);
  });
}
