import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  CommissionPayout,
  type CommissionPayoutRepository,
  type PaidItemRef,
  type PayoutFilter,
  type PayoutItem,
  type PayoutItemKind,
  type PayoutMethod,
} from '@/domain/billing/commission-payout';
import { ConflictError } from '@/domain/shared/errors';
import { newId } from '@/domain/shared/id';
import { isUniqueViolation } from '@/lib/db-errors';
import { type AppDb, MAX_ROWS } from './db';
import { commissionPayoutItems, commissionPayouts } from './schema';
import { withTenant } from './tenant-scope';

type PayoutRow = typeof commissionPayouts.$inferSelect;
type ItemRow = typeof commissionPayoutItems.$inferSelect;

const toItem = (row: ItemRow): PayoutItem => ({
  appointmentId: row.appointmentId,
  kind: row.kind as PayoutItemKind,
  procedure: row.procedure,
  sessionDate: row.sessionDate,
  baseCents: row.baseCents,
  commissionCents: row.commissionCents,
});

const toPayout = (row: PayoutRow, items: ItemRow[]): CommissionPayout =>
  CommissionPayout.restore({
    id: row.id,
    professionalId: row.professionalId,
    period: row.period,
    totalCents: row.totalCents,
    paidAt: row.paidAt,
    paymentMethod: row.paymentMethod as PayoutMethod,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    items: items.map(toItem),
  });

export class DrizzleCommissionPayoutRepository
  implements CommissionPayoutRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(payout: CommissionPayout): Promise<void> {
    const clinicId = this.clinicId;
    if (clinicId === null) {
      throw new Error(
        'Papel de sistema não pode registrar repasse (somente leitura cross-empresa)',
      );
    }
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(commissionPayouts).values({
          id: payout.id,
          clinicId,
          professionalId: payout.professionalId,
          period: payout.period,
          totalCents: payout.totalCents,
          paidAt: payout.paidAt,
          paymentMethod: payout.paymentMethod,
          notes: payout.notes,
          createdBy: payout.createdBy,
          createdAt: payout.createdAt,
        });
        await tx.insert(commissionPayoutItems).values(
          payout.items.map((item) => ({
            id: newId(),
            clinicId,
            payoutId: payout.id,
            professionalId: payout.professionalId,
            ...item,
          })),
        );
      });
    } catch (error) {
      // Dois fechamentos simultâneos (ou o mês já fechado): as constraints
      // únicas barram pagar a mesma sessão ou o mesmo mês duas vezes.
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'Este mês já foi fechado ou alguma sessão já foi paga em outro repasse',
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<CommissionPayout | null> {
    const rows = await this.db
      .select()
      .from(commissionPayouts)
      .where(
        withTenant(
          commissionPayouts,
          this.clinicId,
          eq(commissionPayouts.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      return null;
    }
    const items = await this.db
      .select()
      .from(commissionPayoutItems)
      .where(eq(commissionPayoutItems.payoutId, id));
    return toPayout(rows[0], items);
  }

  async findAll(filter: PayoutFilter = {}): Promise<CommissionPayout[]> {
    const rows = await this.db
      .select()
      .from(commissionPayouts)
      .where(
        withTenant(
          commissionPayouts,
          this.clinicId,
          and(
            filter.professionalId
              ? eq(commissionPayouts.professionalId, filter.professionalId)
              : undefined,
            filter.period
              ? eq(commissionPayouts.period, filter.period)
              : undefined,
          ),
        ),
      )
      .orderBy(
        desc(commissionPayouts.period),
        desc(commissionPayouts.createdAt),
      )
      .limit(MAX_ROWS);
    if (rows.length === 0) {
      return [];
    }
    const items = await this.db
      .select()
      .from(commissionPayoutItems)
      .where(
        inArray(
          commissionPayoutItems.payoutId,
          rows.map((row) => row.id),
        ),
      );
    return rows.map((row) =>
      toPayout(
        row,
        items.filter((item) => item.payoutId === row.id),
      ),
    );
  }

  async findPaidItems(professionalId?: string): Promise<PaidItemRef[]> {
    const rows = await this.db
      .select({
        professionalId: commissionPayoutItems.professionalId,
        appointmentId: commissionPayoutItems.appointmentId,
        kind: commissionPayoutItems.kind,
        commissionCents: commissionPayoutItems.commissionCents,
      })
      .from(commissionPayoutItems)
      .where(
        withTenant(
          commissionPayoutItems,
          this.clinicId,
          professionalId
            ? eq(commissionPayoutItems.professionalId, professionalId)
            : undefined,
        ),
      );
    return rows.map((row) => ({ ...row, kind: row.kind as PayoutItemKind }));
  }
}
