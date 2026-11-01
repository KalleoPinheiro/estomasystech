import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { COMMISSION_TYPES } from '@/domain/professional/professional';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toProfessionalDto } from '@/lib/dto';
import { updateProfessionalRecord } from '@/lib/server/professional-writes';

const updateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  registry: z.string().max(100).nullish(),
  commissionType: z.enum(COMMISSION_TYPES).optional(),
  commissionPct: z.number().int().min(0).max(100).nullish(),
  commissionFixedCents: z.number().int().min(0).max(10_000_000).nullish(),
  active: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = updateSchema.parse(await request.json());
    const { professionals } = await getRepositories(writeScope(guard.session));
    const updated = await updateProfessionalRecord(professionals, id, body);
    return toProfessionalDto(updated);
  });
}
