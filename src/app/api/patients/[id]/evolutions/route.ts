import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AddEvolutionNote } from '@/application/clinical/add-evolution-note';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { resolveSessionProfessionalId } from '@/lib/auth/session-professional';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { toEvolutionNoteDto } from '@/lib/dto';
import { ensureLinkBestEffort } from '@/lib/patient-link';
import { listPatientEvolutions } from '@/lib/server/data/patient-record';

const evolutionSchema = z.object({
  appointmentId: z.string().nullish(),
  subjective: z.string().max(5000).default(''),
  objective: z.string().max(5000).default(''),
  assessment: z.string().max(5000).default(''),
  plan: z.string().max(5000).default(''),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () =>
    listPatientEvolutions(guard.session, (await context.params).id),
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const clinicId = writeClinicId(guard.session);

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = evolutionSchema.parse(await request.json());
    const {
      evolutions,
      patients,
      auditEvents,
      userAccounts,
      professionalPatientLinks,
    } = await getRepositories(clinicScope(clinicId));
    const { session } = guard;
    await assertPatientAccessibleToProfessional(
      session,
      id,
      professionalPatientLinks,
    );
    const professionalId = await resolveSessionProfessionalId(
      session,
      userAccounts,
    );
    const note = await new AddEvolutionNote(evolutions, patients).execute({
      patientId: id,
      appointmentId: body.appointmentId ?? null,
      professionalId,
      subjective: body.subjective,
      objective: body.objective,
      assessment: body.assessment,
      plan: body.plan,
    });
    // Nota de evolução com profissional concede/renova o vínculo com o
    // paciente (RBAC-19/20).
    if (professionalId) {
      await ensureLinkBestEffort(professionalPatientLinks, professionalId, id);
    }
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'evolution',
      resourceId: note.id,
      patientId: id,
    });
    return toEvolutionNoteDto(note);
  });
}
