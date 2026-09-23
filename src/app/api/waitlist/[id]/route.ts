import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ResolveWaitlistEntry } from '@/application/scheduling/waitlist';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toWaitlistEntryDto } from '@/lib/dto';

const resolveSchema = z.object({
  resolution: z.enum(['scheduled', 'removed']),
});

type RouteContext = { params: Promise<{ id: string }> };

/** Tira da fila: vaga marcada (`scheduled`) ou desistência (`removed`). */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = resolveSchema.parse(await request.json());
    const services = await getRepositories(writeScope(guard.session));
    const entry = await new ResolveWaitlistEntry(services.waitlist).execute(
      id,
      body.resolution,
    );
    recordAudit(services.auditEvents, guard.session, {
      action: 'update',
      resourceType: 'waitlist-entry',
      resourceId: entry.id,
      patientId: entry.patientId,
      detail: body.resolution,
    });
    return toWaitlistEntryDto(entry);
  });
}
