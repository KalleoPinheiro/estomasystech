import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateFollowUp } from '@/application/followups/create-follow-up';
import { ListFollowUps } from '@/application/followups/list-follow-ups';
import { FOLLOW_UP_STATUSES } from '@/domain/followup/follow-up';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { linkedPatientFilter } from '@/lib/auth/clinical-resource-scope';
import { assertPatientLinkedForProfessionalWrite } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toFollowUpDto } from '@/lib/dto';

const createSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().nullish(),
  dueDate: z.iso.datetime(),
  reason: z.string().min(1).max(500),
});

const statusSchema = z.enum(FOLLOW_UP_STATUSES).optional();

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const status = statusSchema.parse(
      request.nextUrl.searchParams.get('status') ?? undefined,
    );
    const patientId =
      request.nextUrl.searchParams.get('patientId') ?? undefined;
    const { followUps, patients, reminderLog, professionalPatientLinks } =
      await getRepositories(sessionScope(guard.session));
    // Escopo R4 (#186): o motivo do retorno é clínico — o Profissional só vê
    // os retornos dos pacientes vinculados.
    const isLinked = await linkedPatientFilter(
      guard.session,
      professionalPatientLinks,
    );
    const result = (
      await new ListFollowUps(followUps, patients).execute({
        status,
        patientId,
      })
    ).filter(({ followUp }) => isLinked(followUp.patientId));
    // Selo "3 lembretes sem resposta": recall por e-mail na última tentativa.
    const exhausted = await reminderLog.exhaustedRecalls(
      result.map(({ followUp }) => followUp.id),
    );
    return result.map(({ followUp, patientName, isOverdue }) =>
      toFollowUpDto(
        followUp,
        patientName,
        isOverdue,
        exhausted.has(followUp.id),
      ),
    );
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = createSchema.parse(await request.json());
    const { followUps, patients, professionalPatientLinks } =
      await getRepositories(writeScope(guard.session));
    await assertPatientLinkedForProfessionalWrite(
      guard.session,
      body.patientId,
      professionalPatientLinks,
    );
    const followUp = await new CreateFollowUp(followUps, patients).execute({
      patientId: body.patientId,
      appointmentId: body.appointmentId ?? null,
      dueDate: new Date(body.dueDate),
      reason: body.reason,
    });
    return toFollowUpDto(followUp);
  });
}
