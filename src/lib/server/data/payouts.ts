import 'server-only';
import {
  GetPayoutOverview,
  GetPayoutStatement,
} from '@/application/billing/payouts';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  type PayoutsResponseDto,
  toCommissionPayoutDto,
  toPayoutStatementDto,
} from '@/lib/dto';

/**
 * Livro de repasses da clínica no mês (Admin): o extrato de cada profissional
 * pela regra dele e o histórico de repasses registrados. Mesma resposta de
 * `GET /api/commission-payouts`, que reaproveita esta função.
 */
export async function getClinicPayoutsFor(
  session: Session,
  period: string,
): Promise<PayoutsResponseDto> {
  const { professionals, producedSessions, commissionPayouts } =
    await getRepositories(sessionScope(session));
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
    scope: 'clinic',
    period,
    rows: rows.map(toPayoutStatementDto),
    history: history.map((p) =>
      toCommissionPayoutDto(p, nameById.get(p.professionalId) ?? '—'),
    ),
  };
}

/**
 * Extrato do próprio Profissional. O escopo vem sempre do `professionalId` da
 * sessão, nunca de parâmetro: ninguém lê o extrato alheio. Conta sem
 * profissional vinculado (ex.: Admin) não tem extrato próprio. Mesma resposta
 * de `GET /api/my-payouts`.
 */
export async function getOwnPayoutsFor(
  session: Session,
  period: string,
): Promise<PayoutsResponseDto> {
  const { professionalId } = session;
  if (!professionalId) {
    return { scope: 'own', period, rows: [], history: [] };
  }
  const { professionals, producedSessions, commissionPayouts } =
    await getRepositories(sessionScope(session));
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
}
