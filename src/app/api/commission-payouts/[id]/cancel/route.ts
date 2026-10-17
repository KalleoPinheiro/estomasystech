import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CancelPayout } from '@/application/billing/payouts';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toCommissionPayoutDto } from '@/lib/dto';

const cancelSchema = z.object({ reason: z.string().max(1000) });

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Cancela um repasse registrado por engano (família `administrative`: só
 * Admin). Não apaga: marca cancelado, devolve as sessões ao saldo e audita.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const session = guard.session;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = cancelSchema.parse(await request.json());
    const { commissionPayouts, professionals, auditEvents } =
      await getRepositories(writeScope(session));
    const cancelled = await new CancelPayout(commissionPayouts).execute({
      payoutId: id,
      reason: body.reason,
      cancelledBy: session.subject,
    });
    await recordAuditNow(auditEvents, session, {
      action: 'update',
      resourceType: 'commission-payout',
      resourceId: cancelled.id,
      detail: `repasse ${cancelled.period} cancelado: ${cancelled.cancelReason}`,
    });
    const professional = await professionals.findById(cancelled.professionalId);
    return toCommissionPayoutDto(cancelled, professional?.fullName ?? '—');
  });
}
