import type { FollowUp } from '@/domain/followup/follow-up';
import type {
  FollowUpFilter,
  FollowUpRepository,
} from '@/domain/followup/follow-up-repository';
import type {
  OutflowBySupply,
  OutflowCostByAppointment,
  StockMovementRepository,
  SupplyBatchRepository,
  SupplyRepository,
} from '@/domain/inventory/inventory-repositories';
import type { StockMovement } from '@/domain/inventory/stock-movement';
import type { Supply } from '@/domain/inventory/supply';
import type { SupplyBatch } from '@/domain/inventory/supply-batch';

export class InMemorySupplyRepository implements SupplyRepository {
  private readonly items = new Map<string, Supply>();

  async save(supply: Supply): Promise<void> {
    this.items.set(supply.id, supply);
  }

  async findById(id: string): Promise<Supply | null> {
    return this.items.get(id) ?? null;
  }

  async findAll(): Promise<Supply[]> {
    return [...this.items.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async adjustStock(id: string, delta: number): Promise<Supply | null> {
    const current = this.items.get(id);
    if (!current || current.stockQty + delta < 0) {
      return null;
    }
    if (delta === 0) {
      return current;
    }
    const adjusted =
      delta > 0 ? current.registerEntry(delta) : current.registerExit(-delta);
    this.items.set(id, adjusted);
    return adjusted;
  }
}

export class InMemoryStockMovementRepository
  implements StockMovementRepository
{
  private readonly items = new Map<string, StockMovement>();

  async save(movement: StockMovement): Promise<void> {
    this.items.set(movement.id, movement);
  }

  async findBySupplyId(supplyId: string): Promise<StockMovement[]> {
    return [...this.items.values()]
      .filter((m) => m.supplyId === supplyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByAppointmentId(appointmentId: string): Promise<StockMovement[]> {
    return [...this.items.values()]
      .filter((m) => m.appointmentId === appointmentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getOutflowCostInRange(
    from: Date,
    to: Date,
  ): Promise<OutflowCostByAppointment[]> {
    const totals = new Map<string | null, number>();
    for (const movement of this.items.values()) {
      const at = movement.createdAt.getTime();
      if (movement.type !== 'out' || at < from.getTime() || at >= to.getTime())
        continue;
      const cost = movement.totalCostCents ?? 0;
      totals.set(
        movement.appointmentId,
        (totals.get(movement.appointmentId) ?? 0) + cost,
      );
    }
    return [...totals.entries()].map(([appointmentId, totalCents]) => ({
      appointmentId,
      totalCents,
    }));
  }

  async getOutflowQtyInRange(from: Date, to: Date): Promise<OutflowBySupply[]> {
    const totals = new Map<string, number>();
    for (const movement of this.items.values()) {
      const at = movement.createdAt.getTime();
      if (movement.type !== 'out' || at < from.getTime() || at >= to.getTime())
        continue;
      totals.set(
        movement.supplyId,
        (totals.get(movement.supplyId) ?? 0) + movement.quantity,
      );
    }
    return [...totals.entries()].map(([supplyId, totalQty]) => ({
      supplyId,
      totalQty,
    }));
  }
}

export class InMemorySupplyBatchRepository implements SupplyBatchRepository {
  private readonly items = new Map<string, SupplyBatch>();

  async save(batch: SupplyBatch): Promise<void> {
    this.items.set(batch.id, batch);
  }

  private static byExpiryFefo(a: SupplyBatch, b: SupplyBatch): number {
    const aT = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bT = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return aT - bT || a.createdAt.getTime() - b.createdAt.getTime();
  }

  async findActiveBySupplyId(supplyId: string): Promise<SupplyBatch[]> {
    return [...this.items.values()]
      .filter((b) => b.supplyId === supplyId && b.remaining > 0)
      .sort(InMemorySupplyBatchRepository.byExpiryFefo);
  }

  async findExpiringBefore(limit: Date): Promise<SupplyBatch[]> {
    return [...this.items.values()]
      .filter(
        (b) =>
          b.remaining > 0 &&
          b.expiresAt != null &&
          b.expiresAt.getTime() <= limit.getTime(),
      )
      .sort(InMemorySupplyBatchRepository.byExpiryFefo);
  }
}

export class InMemoryFollowUpRepository implements FollowUpRepository {
  private readonly items = new Map<string, FollowUp>();

  async save(followUp: FollowUp): Promise<void> {
    this.items.set(followUp.id, followUp);
  }

  async findById(id: string): Promise<FollowUp | null> {
    return this.items.get(id) ?? null;
  }

  async findAll(filter?: FollowUpFilter): Promise<FollowUp[]> {
    return [...this.items.values()]
      .filter((f) => {
        if (filter?.status && f.status !== filter.status) return false;
        if (filter?.patientId && f.patientId !== filter.patientId) return false;
        if (
          filter?.dueBefore &&
          f.dueDate.getTime() >= filter.dueBefore.getTime()
        )
          return false;
        return true;
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  async findPendingDueBefore(dueBefore: Date): Promise<FollowUp[]> {
    return this.findAll({ status: 'pending', dueBefore });
  }
}
