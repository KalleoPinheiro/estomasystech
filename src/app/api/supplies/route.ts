import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateSupply } from '@/application/inventory/create-supply';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toSupplyDto } from '@/lib/dto';
import { listSuppliesFor } from '@/lib/server/data/supplies';

const supplySchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(20),
  minQty: z.number().int().nonnegative().max(1_000_000),
  priceCents: z.number().int().nonnegative().max(1_000_000_000),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(() => listSuppliesFor(guard.session));
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = supplySchema.parse(await request.json());
    const { supplies } = await getRepositories(writeScope(guard.session));
    return toSupplyDto(await new CreateSupply(supplies).execute(body));
  });
}
