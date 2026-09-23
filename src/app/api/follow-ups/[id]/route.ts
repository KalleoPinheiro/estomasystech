import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { SetFollowUpStatus } from '@/application/followups/set-follow-up-status';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toFollowUpDto } from '@/lib/dto';

const patchSchema = z.object({ status: z.enum(['done', 'cancelled']) });

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const { followUps } = await getRepositories(writeScope(guard.session));
    return toFollowUpDto(
      await new SetFollowUpStatus(followUps).execute({
        id,
        status: body.status,
      }),
    );
  });
}
