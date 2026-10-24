import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ClosePayout, GetPayoutOverview } from '@/application/billing/payouts';
import { PAYOUT_METHODS } from '@/domain/billing/commission-payout';
import { zonedInstant } from '@/domain/shared/time-zone';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import {
  PAYOUT_PERIOD_REGEX,
  previousPeriod,
  toCommissionPayoutDto,
  toPayoutStatementDto,
} from '@/lib/dto';

/**
 * Livro de repasses da clínica — família `administrative` (`route-family.ts`):
 * só Admin de Empresa/Super Admin chegam aqui. O Profissional lê o próprio
 * extrato em `/api/my-payouts`.
 */

const closeSchema = z.object({
  professionalId: z.string().min(1).max(100),
  period: z
    .string()
    .regex(PAYOUT_PERIOD_REGEX, 'Mês deve estar no formato AAAA-MM'),
  paidAt: z.iso.date(),
  paymentMethod: z.enum(PAYOUT_METHODS),
  notes: z.string().max(1000).nullish(),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const period =
    request.nextUrl.searchParams.get('month') ?? previousPeriod(new Date());
  if (!PAYOUT_PERIOD_REGEX.test(period)) {
    return fail('Parâmetro month deve estar no formato AAAA-MM', 400);
  }

  return handleRequest(async () => {
    const { professionals, producedSessions, commissionPayouts } =
      await getRepositories(sessionScope(guard.session));
    const [rows, history, all] = await Promise.all([
      new GetPayoutOverview({
        professionals,
        producedSessions,
        payouts: commissionPayouts,
      }).execute({ period }),
      commissionPayouts.findAll(),
      professionals.findAll(),
    ]);
    const nameById = new Map(all.map((p) => [p.id, p.fullName]));
    return {
      scope: 'clinic' as const,
      period,
      rows: rows.map(toPayoutStatementDto),
      history: history.map((p) =>
        toCommissionPayoutDto(p, nameById.get(p.professionalId) ?? '—'),
      ),
    };
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const session = guard.session;

  return handleRequest(async () => {
    const body = closeSchema.parse(await request.json());
    const { professionals, producedSessions, commissionPayouts, auditEvents } =
      await getRepositories(writeScope(session));
    const payout = await new ClosePayout({
      professionals,
      producedSessions,
      payouts: commissionPayouts,
    }).execute({
      professionalId: body.professionalId,
      period: body.period,
      // Data do pagamento ao meio-dia da clínica: não "volta" um dia em UTC.
      paidAt: zonedInstant(
        ...(body.paidAt.split('-').map(Number) as [number, number, number]),
        12,
      ),
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
