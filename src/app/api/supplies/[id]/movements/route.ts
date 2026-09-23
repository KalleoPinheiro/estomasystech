import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { RegisterStockMovement } from '@/application/inventory/register-stock-movement';
import { MOVEMENT_TYPES } from '@/domain/inventory/stock-movement';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toStockMovementDto, toSupplyDto } from '@/lib/dto';

const movementSchema = z.object({
  type: z.enum(MOVEMENT_TYPES),
  quantity: z.number().int().positive().max(1_000_000),
  reason: z.string().min(1).max(500),
  appointmentId: z.string().max(100).nullish(),
  batchLabel: z.string().max(100).nullish(),
  expiresAt: z.iso.datetime().nullish(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { stockMovements } = await getRepositories(
      sessionScope(guard.session),
    );
    const movements = await stockMovements.findBySupplyId(id);
    return movements.map(toStockMovementDto);
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = movementSchema.parse(await request.json());
    const { supplies, stockMovements, appointments, supplyBatches } =
      await getRepositories(writeScope(guard.session));
    const supply = await new RegisterStockMovement(
      supplies,
      stockMovements,
      appointments,
      supplyBatches,
    ).execute({
      supplyId: id,
      type: body.type,
      quantity: body.quantity,
      reason: body.reason,
      appointmentId: body.appointmentId ?? null,
      batchLabel: body.batchLabel ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });
    return toSupplyDto(supply);
  });
}
