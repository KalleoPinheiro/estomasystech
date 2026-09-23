import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { COMMISSION_TYPES } from '@/domain/professional/professional';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toProfessionalDto } from '@/lib/dto';

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

    const existing = await professionals.findById(id);
    if (!existing) {
      throw new NotFoundError('Profissional', id);
    }

    let updated = existing.update({
      fullName: body.fullName,
      registry: body.registry !== undefined ? body.registry : undefined,
      commissionType: body.commissionType,
      commissionPct: body.commissionPct,
      commissionFixedCents: body.commissionFixedCents,
    });
    if (body.active === true) updated = updated.reactivate();
    if (body.active === false) updated = updated.deactivate();

    await professionals.save(updated);
    return toProfessionalDto(updated);
  });
}
