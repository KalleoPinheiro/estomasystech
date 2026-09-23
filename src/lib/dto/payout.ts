import type { ProfessionalStatement } from '@/application/billing/payouts';
import type { CommissionRule } from '@/domain/billing/commission';
import type {
  CommissionPayout,
  PayoutItem,
  PayoutItemKind,
  PayoutMethod,
} from '@/domain/billing/commission-payout';

/** Mês de fechamento (AAAA-MM). */
export const PAYOUT_PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mês anterior ao atual — o próximo a ser fechado. */
export function previousPeriod(now: Date): string {
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export interface PayoutItemDto {
  appointmentId: string;
  kind: PayoutItemKind;
  procedure: string;
  sessionDate: string;
  baseCents: number;
  commissionCents: number;
}

export interface CommissionPayoutDto {
  id: string;
  professionalId: string;
  professionalName: string;
  period: string;
  totalCents: number;
  paidAt: string;
  paymentMethod: PayoutMethod;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  items: PayoutItemDto[];
}

export interface PayoutStatementDto {
  professionalId: string;
  professionalName: string;
  active: boolean;
  rule: CommissionRule | null;
  payableCents: number;
  pendingCents: number;
  payable: PayoutItemDto[];
  pending: PayoutItemDto[];
  closedPayout: CommissionPayoutDto | null;
}

export const toPayoutItemDto = (item: PayoutItem): PayoutItemDto => ({
  appointmentId: item.appointmentId,
  kind: item.kind,
  procedure: item.procedure,
  sessionDate: item.sessionDate.toISOString(),
  baseCents: item.baseCents,
  commissionCents: item.commissionCents,
});

export const toCommissionPayoutDto = (
  payout: CommissionPayout,
  professionalName: string,
): CommissionPayoutDto => ({
  id: payout.id,
  professionalId: payout.professionalId,
  professionalName,
  period: payout.period,
  totalCents: payout.totalCents,
  paidAt: payout.paidAt.toISOString(),
  paymentMethod: payout.paymentMethod,
  notes: payout.notes,
  createdBy: payout.createdBy,
  createdAt: payout.createdAt.toISOString(),
  items: payout.items.map(toPayoutItemDto),
});

export const toPayoutStatementDto = (
  row: ProfessionalStatement,
): PayoutStatementDto => ({
  professionalId: row.professional.id,
  professionalName: row.professional.fullName,
  active: row.professional.isActive,
  rule: row.rule,
  payableCents: row.statement.payableCents,
  pendingCents: row.statement.pendingCents,
  payable: row.statement.payable.map(toPayoutItemDto),
  pending: row.statement.pending.map(toPayoutItemDto),
  closedPayout: row.closedPayout
    ? toCommissionPayoutDto(row.closedPayout, row.professional.fullName)
    : null,
});

/** Resposta de `GET /api/commission-payouts` (visão da clínica, Admin) e de `GET /api/my-payouts` (próprio extrato). */
export interface PayoutsResponseDto {
  scope: 'clinic' | 'own';
  period: string;
  rows: PayoutStatementDto[];
  history: CommissionPayoutDto[];
}
