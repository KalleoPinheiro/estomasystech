import type { NextRequest } from 'next/server';
import { ClosePayout } from '@/application/billing/payouts';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import {
  PAYOUT_PERIOD_REGEX,
  previousPeriod,
  toCommissionPayoutDto,
} from '@/lib/dto';
import { getClinicPayoutsFor } from '@/lib/server/data/payouts';
import { closePayoutSchema, payoutPaidAt } from '@/lib/server/payout-input';

/**
 * Livro de repasses da clínica — família `administrative` (`route-family.ts`):
 * só Admin de Empresa/Super Admin chegam aqui. O Profissional lê o próprio
 * extrato em `/api/my-payouts`.
 */

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const period =
    request.nextUrl.searchParams.get('month') ?? previousPeriod(new Date());
  if (!PAYOUT_PERIOD_REGEX.test(period)) {
    return fail('Parâmetro month deve estar no formato AAAA-MM', 400);
  }

  return handleRequest(() => getClinicPayoutsFor(guard.session, period));
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const session = guard.session;

  return handleRequest(async () => {
    const body = closePayoutSchema.parse(await request.json());
    const { professionals, producedSessions, commissionPayouts, auditEvents } =
      await getRepositories(writeScope(session));
    const payout = await new ClosePayout({
      professionals,
      producedSessions,
      payouts: commissionPayouts,
    }).execute({
      professionalId: body.professionalId,
      period: body.period,
      paidAt: payoutPaidAt(body.paidAt),
      paymentMethod: body.paymentMethod,
      notes: body.notes,
      createdBy: session.subject,
    });
    await recordAuditNow(auditEvents, session, {
      action: 'create',
      resourceType: 'commission-payout',
      resourceId: payout.id,
      detail: `repasse ${payout.period}: ${payout.items.length} itens`,
    });
    const professional = await professionals.findById(payout.professionalId);
    return toCommissionPayoutDto(payout, professional?.fullName ?? '—');
  });
}
