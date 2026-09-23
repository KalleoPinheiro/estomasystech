import type { NextRequest } from 'next/server';
import { GetPayoutStatement } from '@/application/billing/payouts';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  PAYOUT_PERIOD_REGEX,
  type PayoutsResponseDto,
  previousPeriod,
  toCommissionPayoutDto,
  toPayoutStatementDto,
} from '@/lib/dto';

/**
 * Extrato de repasses do próprio Profissional — família `professional_self`
 * (Admin e Profissional entram; Atendente não). O escopo vem sempre do
 * `professionalId` da sessão, nunca de parâmetro: ninguém lê o extrato alheio.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const period =
    request.nextUrl.searchParams.get('month') ?? previousPeriod(new Date());
  if (!PAYOUT_PERIOD_REGEX.test(period)) {
    return fail('Parâmetro month deve estar no formato AAAA-MM', 400);
  }
  const professionalId = guard.session?.professionalId ?? null;

  return handleRequest(async (): Promise<PayoutsResponseDto> => {
    // Conta sem profissional vinculado (ex.: Admin) não tem extrato próprio.
    if (!professionalId) {
      return { scope: 'own', period, rows: [], history: [] };
    }
    const { professionals, producedSessions, commissionPayouts } =
      await getRepositories(sessionScope(guard.session));
    const [statement, history] = await Promise.all([
      new GetPayoutStatement({
        professionals,
        producedSessions,
        payouts: commissionPayouts,
      }).execute({ professionalId, period }),
      commissionPayouts.findAll({ professionalId }),
    ]);
    const name = statement.professional.fullName;
    return {
      scope: 'own',
      period,
      rows: [toPayoutStatementDto(statement)],
      history: history.map((p) => toCommissionPayoutDto(p, name)),
    };
  });
}
