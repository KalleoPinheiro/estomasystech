import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateFollowUp } from '@/application/followups/create-follow-up';
import { ListFollowUps } from '@/application/followups/list-follow-ups';
import { FOLLOW_UP_STATUSES } from '@/domain/followup/follow-up';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
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
    const { followUps, patients } = await getRepositories(
      sessionScope(guard.session),
    );
    const result = await new ListFollowUps(followUps, patients).execute({
      status,
      patientId,
    });
    return result.map(({ followUp, patientName, isOverdue }) =>
      toFollowUpDto(followUp, patientName, isOverdue),
    );
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = createSchema.parse(await request.json());
    const { followUps, patients } = await getRepositories(
      writeScope(guard.session),
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
