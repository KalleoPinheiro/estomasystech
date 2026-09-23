import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { UpdateSupply } from '@/application/inventory/update-supply';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toSupplyDto } from '@/lib/dto';

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(20).optional(),
  minQty: z.number().int().nonnegative().max(1_000_000).optional(),
  priceCents: z.number().int().nonnegative().max(1_000_000_000).optional(),
  active: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = updateSchema.parse(await request.json());
    const { supplies } = await getRepositories(writeScope(guard.session));
    return toSupplyDto(
      await new UpdateSupply(supplies).execute({ id, ...body }),
    );
  });
}
