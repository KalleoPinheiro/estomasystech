import type { NextRequest } from 'next/server';
import { DeleteScheduleClosure } from '@/application/scheduling/schedule-availability';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const services = await getRepositories(writeScope(guard.session));
    // A sessão é o ator: o caso de uso aplica a regra por papel (#215).
    const closure = await new DeleteScheduleClosure(
      services.scheduleAvailability,
    ).execute(id, guard.session);
    recordAudit(services.auditEvents, guard.session, {
      action: 'delete',
      resourceType: 'schedule-closure',
      resourceId: closure.id,
      detail: `${closure.startsOn}..${closure.endsOn}: ${closure.reason}`,
    });
    return { id: closure.id };
  });
}
