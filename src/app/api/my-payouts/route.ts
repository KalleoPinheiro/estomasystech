import type { NextRequest } from 'next/server';
import { fail, handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { PAYOUT_PERIOD_REGEX, previousPeriod } from '@/lib/dto';
import { getOwnPayoutsFor } from '@/lib/server/data/payouts';

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

  return handleRequest(() => getOwnPayoutsFor(guard.session, period));
}
