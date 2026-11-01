import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateFollowUp } from '@/application/followups/create-follow-up';
import { FOLLOW_UP_STATUSES } from '@/domain/followup/follow-up';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { assertPatientLinkedForProfessionalWrite } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toFollowUpDto } from '@/lib/dto';
import { listFollowUpsFor } from '@/lib/server/data/follow-ups';

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

  return handleRequest(async () =>
    listFollowUpsFor(guard.session, {
      status: statusSchema.parse(
        request.nextUrl.searchParams.get('status') ?? undefined,
      ),
      patientId: request.nextUrl.searchParams.get('patientId') ?? undefined,
    }),
  );
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
