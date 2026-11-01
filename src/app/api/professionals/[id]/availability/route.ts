import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { SetProfessionalHours } from '@/application/scheduling/schedule-availability';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { getProfessionalHoursFor } from '@/lib/server/data/professionals';

const hoursSchema = z.object({
  windows: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(0).max(1440),
      }),
    )
    .max(21),
});

type RouteContext = { params: Promise<{ id: string }> };

/** Horário semanal de atendimento do profissional (vazio = segue a clínica). */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    return getProfessionalHoursFor(guard.session, id);
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = hoursSchema.parse(await request.json());
    const services = await getRepositories(writeScope(guard.session));
    const windows = await new SetProfessionalHours(
      services.scheduleAvailability,
      services.professionals,
    ).execute(id, body.windows);
    recordAudit(services.auditEvents, guard.session, {
      action: 'update',
      resourceType: 'professional-availability',
      resourceId: id,
    });
    return { windows };
  });
}
