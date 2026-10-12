import type { NextRequest } from 'next/server';
import { loadPatientDataExport } from '@/application/patients/load-patient-data-export';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toPatientExportDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Exportação completa dos dados do titular (LGPD art. 18 — portabilidade).
 * JSON único com tudo que o sistema mantém sobre o paciente; geração auditada.
 * Família `clinical` (route-family.ts): Atendente é barrado na guarda (403).
 * O paciente baixa o mesmo conteúdo pelo portal (`/api/portal/patient/export`, #293).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const response = await handleRequest(async () => {
    const { id } = await context.params;
    const repos = await getRepositories(sessionScope(guard.session));
    // R4: Profissional sem vínculo recebe 404, como nas demais subrotas clínicas (#185).
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      repos.professionalPatientLinks,
    );

    const patient = await repos.patients.findById(id);
    if (!patient) {
      throw new NotFoundError('Paciente', id);
    }
    const data = await loadPatientDataExport(repos, patient);

    // Write-ahead (SEC1-20): exportação sem trilha de auditoria não responde sucesso.
    await recordAuditNow(repos.auditEvents, guard.session, {
      action: 'read',
      resourceType: 'export',
      resourceId: id,
      patientId: id,
      detail: 'exportação LGPD do titular',
    });

    return toPatientExportDto(data);
  });
  // Dados clínicos completos do titular (LGPD): o navegador não pode
  // reaproveitar a resposta depois de uma troca de clínica no mesmo perfil.
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
