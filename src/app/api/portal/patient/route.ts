import type { NextRequest } from 'next/server';
import { getGuardianAccess } from '@/application/portal/get-guardian-access';
import { GetPatientPortalData } from '@/application/portal/get-patient-portal-data';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { cancellationPolicyOf } from '@/domain/scheduling/schedule-config';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  toConditionPhotoDto,
  toFollowUpDto,
  toInvoiceDto,
  toPortalAppointmentDto,
  toPortalAssessmentDto,
  toPortalConditionDto,
  toPortalPatientProfileDto,
} from '@/lib/dto';

function toGuardianAccessDto(
  access: Awaited<ReturnType<typeof getGuardianAccess>>,
) {
  return access
    ? {
        fullName: access.fullName,
        relationshipLabel: access.relationshipLabel,
        lastAccessAt: access.lastAccessAt?.toISOString() ?? null,
      }
    : null;
}

export async function GET(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    // Escopo da sessão do portal: e-mail pode repetir entre empresas (MT-06),
    // então a busca por e-mail e todo o resto ficam na clínica da conta.
    const services = await getRepositories(sessionScope(session));
    const {
      patients,
      appointments,
      conditions,
      assessments,
      invoices,
      followUps,
      conditionPhotos,
    } = services;
    const data = await new GetPatientPortalData(
      patients,
      appointments,
      conditions,
      assessments,
      invoices,
      followUps,
      conditionPhotos,
    ).execute({
      patientId: (await resolvePortalPatient(services, session)).id,
    });
    const isGuardian = session.role === 'guardian';

    recordAudit(services.auditEvents, session, {
      action: 'read',
      resourceType: 'portal-patient',
      resourceId: data.patient.id,
      patientId: data.patient.id,
    });
    return {
      patient: toPortalPatientProfileDto(data.patient),
      appointments: data.appointments.map(toPortalAppointmentDto),
      conditions: data.conditions.map(
        ({ condition, assessments: list, photos }) => ({
          condition: toPortalConditionDto(condition),
          assessments: list.map(toPortalAssessmentDto),
          photos: (photos ?? []).map(toConditionPhotoDto),
        }),
      ),
      invoices: data.invoices.map((i) => toInvoiceDto(i)),
      followUps: data.followUps.map((f) => toFollowUpDto(f)),
      // Antecedência mínima para cancelar/remarcar pelo portal (política da clínica).
      // Evidência (ADR-026): o responsável vê em nome de quem age; o paciente
      // vê quem pode agir em nome dele e quando foi o último acesso.
      actingFor: isGuardian
        ? { patientId: data.patient.id, fullName: data.patient.fullName }
        : null,
      guardianAccess: isGuardian
        ? null
        : toGuardianAccessDto(await getGuardianAccess(services, data.patient)),
      changeNoticeHours: cancellationPolicyOf(
        await services.scheduleConfig.get(),
      ).noticeHours,
    };
  });
}
