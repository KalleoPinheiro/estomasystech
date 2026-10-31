import type { NextRequest } from 'next/server';
import { RecordIntervention } from '@/application/clinical/record-intervention';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { resolveSessionProfessionalId } from '@/lib/auth/session-professional';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toInterventionRecordDto } from '@/lib/dto';
import { recordSchema } from '@/lib/patient-record-schemas';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const repos = await getRepositories(writeScope(guard.session));
    await assertClinicalResourceAccessible(
      guard.session,
      'carePlanIntervention',
      id,
      repos,
    );
    const body = recordSchema.parse(await request.json());
    const {
      interventionRecords,
      carePlanInterventions,
      carePlans,
      auditEvents,
      userAccounts,
    } = repos;
    const record = await new RecordIntervention(
      interventionRecords,
      carePlanInterventions,
      carePlans,
    ).execute({
      interventionId: id,
      // Autoria pela sessão (#200) — o corpo não escolhe o profissional.
      professionalId: await resolveSessionProfessionalId(
        guard.session,
        userAccounts,
      ),
      notes: body.notes ?? null,
    });
    const intervention = await carePlanInterventions.findById(id);
    const plan = intervention
      ? await carePlans.findById(intervention.carePlanId)
      : null;
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'intervention_record',
      resourceId: record.id,
      patientId: plan?.patientId ?? null,
    });
    return toInterventionRecordDto(record);
  });
}
