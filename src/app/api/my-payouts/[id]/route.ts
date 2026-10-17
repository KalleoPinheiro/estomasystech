import type { NextRequest } from 'next/server';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type PayoutReceiptDto, toCommissionPayoutDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Repasse do próprio Profissional (comprovante). Repasse de outro profissional
 * responde 404 — nem a existência dele é revelada.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const professionalId = guard.session.professionalId;

  return handleRequest(async (): Promise<PayoutReceiptDto> => {
    const { id } = await context.params;
    const { commissionPayouts, professionals } = await getRepositories(
      sessionScope(guard.session),
    );
    const payout = await commissionPayouts.findById(id);
    if (
      !payout ||
      !professionalId ||
      payout.professionalId !== professionalId
    ) {
      throw new NotFoundError('Repasse', id);
    }
    const professional = await professionals.findById(professionalId);
    const fullName = professional?.fullName ?? '—';
    return {
      payout: toCommissionPayoutDto(payout, fullName),
      professional: { fullName, registry: professional?.registry ?? null },
    };
  });
}
