import type { NextRequest } from 'next/server';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  toAnamnesisDto,
  toAppointmentDto,
  toAssessmentDto,
  toConditionDto,
  toConditionPhotoDto,
  toEvolutionNoteDto,
  toInvoiceDto,
  toPatientDto,
} from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Exportação completa dos dados do titular (LGPD art. 18 — portabilidade).
 * JSON único com tudo que o sistema mantém sobre o paciente; geração auditada.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const response = await handleRequest(async () => {
    const { id } = await context.params;
    const repos = await getRepositories(sessionScope(guard.session));

    const patient = await repos.patients.findById(id);
    if (!patient) {
      throw new NotFoundError('Paciente', id);
    }

    const [
      anamnesis,
      evolutions,
      conditions,
      appointments,
      invoices,
      consents,
    ] = await Promise.all([
      repos.anamneses.findByPatientId(id),
      repos.evolutions.findByPatientId(id),
      repos.conditions.findByPatientId(id),
      repos.appointments.findByPatientId(id),
      repos.invoices.findAll({ patientId: id }),
      repos.consentRecords.findByPatientId(id),
    ]);
    const conditionIds = conditions.map((condition) => condition.id);
    const [assessments, photos, packages] = await Promise.all([
      repos.assessments.findByConditionIds(conditionIds),
      repos.conditionPhotos.findByConditionIds(conditionIds),
      repos.sessionPackages.findByPatientId(id),
    ]);

    // Write-ahead (SEC1-20): exportação sem trilha de auditoria não responde sucesso.
    await recordAuditNow(repos.auditEvents, guard.session, {
      action: 'read',
      resourceType: 'export',
      resourceId: id,
      patientId: id,
      detail: 'exportação LGPD do titular',
    });

    return {
      exportedAt: new Date().toISOString(),
      patient: toPatientDto(patient),
      anamnesis: anamnesis ? toAnamnesisDto(anamnesis) : null,
      evolutions: evolutions.map(toEvolutionNoteDto),
      conditions: conditions.map(toConditionDto),
      assessments: assessments.map(toAssessmentDto),
      photos: photos.map(toConditionPhotoDto),
      appointments: appointments.map((appointment) =>
        toAppointmentDto(appointment),
      ),
      invoices: invoices.map((invoice) => toInvoiceDto(invoice)),
      consents: consents.map((consent) => ({
        id: consent.id,
        textHash: consent.textHash,
        acceptedAt: consent.acceptedAt.toISOString(),
      })),
      packages: packages.map((pkg) => ({
        id: pkg.id,
        procedureId: pkg.procedureId,
        totalSessions: pkg.totalSessions,
        usedSessions: pkg.usedSessions,
        priceCents: pkg.priceCents,
      })),
    };
  });
  // Dados clínicos completos do titular (LGPD): o navegador não pode
  // reaproveitar a resposta depois de uma troca de clínica no mesmo perfil.
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
