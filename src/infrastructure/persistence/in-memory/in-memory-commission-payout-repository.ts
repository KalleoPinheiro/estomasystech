import type {
  CommissionPayout,
  CommissionPayoutRepository,
  PaidItemRef,
  PayoutFilter,
} from '@/domain/billing/commission-payout';
import { ConflictError } from '@/domain/shared/errors';

/** Espelho em memória, com as mesmas unicidades do Drizzle. */
export class InMemoryCommissionPayoutRepository
  implements CommissionPayoutRepository
{
  private readonly items = new Map<string, CommissionPayout>();

  async save(payout: CommissionPayout): Promise<void> {
    const paidKeys = new Set(
      (await this.findPaidItems()).map((i) => `${i.appointmentId}:${i.kind}`),
    );
    const duplicated =
      [...this.items.values()].some(
        (p) =>
          p.isActive &&
          p.professionalId === payout.professionalId &&
          p.period === payout.period,
      ) ||
      payout.items.some((i) => paidKeys.has(`${i.appointmentId}:${i.kind}`));
    if (duplicated) {
      throw new ConflictError(
        'Este mês já foi fechado ou alguma sessão já foi paga em outro repasse',
      );
    }
    this.items.set(payout.id, payout);
  }

  async saveCancellation(payout: CommissionPayout): Promise<void> {
    this.items.set(payout.id, payout);
  }

  async findById(id: string): Promise<CommissionPayout | null> {
    return this.items.get(id) ?? null;
  }

  async findAll(filter: PayoutFilter = {}): Promise<CommissionPayout[]> {
    return [...this.items.values()]
      .filter(
        (p) =>
          (!filter.professionalId ||
            p.professionalId === filter.professionalId) &&
          (!filter.period || p.period === filter.period),
      )
      .sort(
        (a, b) =>
          b.period.localeCompare(a.period) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
  }

  async findPaidItems(professionalId?: string): Promise<PaidItemRef[]> {
    return [...this.items.values()]
      .filter(
        (p) =>
          p.isActive &&
          (!professionalId || p.professionalId === professionalId),
      )
      .flatMap((p) =>
        p.items.map((item) => ({
          professionalId: p.professionalId,
          appointmentId: item.appointmentId,
          kind: item.kind,
          commissionCents: item.commissionCents,
        })),
      );
  }
}
