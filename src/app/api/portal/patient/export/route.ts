import type { NextRequest } from 'next/server';
import { loadPatientDataExport } from '@/application/patients/load-patient-data-export';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requirePortalSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toPatientExportDto } from '@/lib/dto';

/**
 * Cópia dos próprios dados (LGPD art. 18, II e V; #293): o mesmo JSON da
 * exportação da equipe, só do titular da conta da sessão (POR-RN-08) — o
 * paciente não escolhe id. Auditada antes de responder (`read`/`export`).
 */
export async function GET(request: NextRequest) {
  const auth = requirePortalSession(request, 'patient');
  if (!auth.ok) return auth.response;

  const response = await handleRequest(async () => {
    const repos = await getRepositories(sessionScope(auth.session));
    const patient = await resolvePortalPatient(repos, auth.session);
    const data = await loadPatientDataExport(repos, patient);

    // Write-ahead (SEC1-20), como na exportação da equipe.
    await recordAuditNow(repos.auditEvents, auth.session, {
      action: 'read',
      resourceType: 'export',
      resourceId: patient.id,
      patientId: patient.id,
      detail: 'cópia dos próprios dados pelo portal',
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
