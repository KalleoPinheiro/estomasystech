import type { NextRequest } from 'next/server';
import { loadPatientDataExport } from '@/application/patients/load-patient-data-export';
import {
  ADULT_TITULAR_ONLY_MESSAGE,
  resolveConsentSigner,
} from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toPatientExportDto } from '@/lib/dto';

/**
 * Cópia dos próprios dados (LGPD art. 18, II e V; #293): o mesmo JSON da
 * exportação da equipe, só do titular da conta da sessão (POR-RN-08) — o
 * paciente não escolhe id. Auditada antes de responder (`read`/`export`).
 * O representante legal baixa a do menor (#375, ADR-033).
 */
export async function GET(request: NextRequest) {
  const auth = requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;

  const response = await handleRequest(async () => {
    const repos = await getRepositories(sessionScope(auth.session));
    const { patient, signer } = await resolveConsentSigner(
      repos,
      auth.session,
      ADULT_TITULAR_ONLY_MESSAGE,
    );
    const data = await loadPatientDataExport(repos, patient);

    // Write-ahead (SEC1-20), como na exportação da equipe.
    await recordAuditNow(repos.auditEvents, auth.session, {
      action: 'read',
      resourceType: 'export',
      resourceId: patient.id,
      patientId: patient.id,
      detail: signer
        ? 'cópia dos dados do menor pelo representante legal'
        : 'cópia dos próprios dados pelo portal',
    });

    return toPatientExportDto(data);
  });
  response.headers.set('Cache-Control', 'no-store');
  if (response.status === 200) {
    response.headers.set(
      'Content-Disposition',
      'attachment; filename="meus-dados.json"',
    );
  }
  return response;
}
