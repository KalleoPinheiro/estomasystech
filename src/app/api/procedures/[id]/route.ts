import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toProcedureDto } from '@/lib/dto';
import { updateProcedureRecord } from '@/lib/server/procedure-writes';

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  priceCents: z.number().int().min(0).max(1_000_000_000).optional(),
  durationMinutes: z.number().int().min(1).max(480).optional(),
  active: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = updateSchema.parse(await request.json());
    const { procedures } = await getRepositories(writeScope(guard.session));

    const updated = await updateProcedureRecord(procedures, id, body);
    return toProcedureDto(updated);
  });
}
