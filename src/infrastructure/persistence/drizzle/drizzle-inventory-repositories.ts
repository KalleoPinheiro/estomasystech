import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  lt,
  lte,
  type SQL,
  sql,
} from 'drizzle-orm';
import { FollowUp, type FollowUpStatus } from '@/domain/followup/follow-up';
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
import {
  type MovementType,
  StockMovement,
} from '@/domain/inventory/stock-movement';
import { Supply } from '@/domain/inventory/supply';
import { SupplyBatch } from '@/domain/inventory/supply-batch';
import { type AppDb, MAX_ROWS } from './db';
import { followUps, stockMovements, supplies, supplyBatches } from './schema';
import { withTenant } from './tenant-scope';

export class DrizzleSupplyRepository implements SupplyRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(supply: Supply): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar insumo (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: supply.id,
      clinicId: this.clinicId,
      name: supply.name,
      unit: supply.unit,
      minQty: supply.minQty,
      priceCents: supply.priceCents,
      stockQty: supply.stockQty,
      active: supply.isActive,
      createdAt: supply.createdAt,
    };
    await this.db
      .insert(supplies)
      .values(values)
      .onConflictDoUpdate({ target: supplies.id, set: values });
  }

  async findById(id: string): Promise<Supply | null> {
    const rows = await this.db
      .select()
      .from(supplies)
      .where(withTenant(supplies, this.clinicId, eq(supplies.id, id)))
      .limit(1);
    return rows[0] ? Supply.restore(rows[0]) : null;
  }

  async adjustStock(id: string, delta: number): Promise<Supply | null> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode ajustar insumo (somente leitura cross-empresa)',
      );
    }
    const rows = await this.db
      .update(supplies)
      .set({ stockQty: sql`${supplies.stockQty} + ${delta}` })
      .where(
        withTenant(
          supplies,
          this.clinicId,
          and(eq(supplies.id, id), sql`${supplies.stockQty} + ${delta} >= 0`),
        ),
      )
      .returning();
    return rows[0] ? Supply.restore(rows[0]) : null;
  }

  async findAll(): Promise<Supply[]> {
    const rows = await this.db
      .select()
      .from(supplies)
      .where(withTenant(supplies, this.clinicId))
      .orderBy(asc(supplies.name))
      .limit(MAX_ROWS);
    return rows.map((row) => Supply.restore(row));
  }
}

export class DrizzleStockMovementRepository implements StockMovementRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(movement: StockMovement): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar movimento de estoque (somente leitura cross-empresa)',
      );
    }
    await this.db.insert(stockMovements).values({
      id: movement.id,
      clinicId: this.clinicId,
      supplyId: movement.supplyId,
      type: movement.type,
      quantity: movement.quantity,
      reason: movement.reason,
      appointmentId: movement.appointmentId,
      unitPriceCents: movement.unitPriceCents,
      createdAt: movement.createdAt,
    });
  }

  async findBySupplyId(supplyId: string): Promise<StockMovement[]> {
    const rows = await this.db
      .select()
      .from(stockMovements)
      .where(
        withTenant(
          stockMovements,
          this.clinicId,
          eq(stockMovements.supplyId, supplyId),
        ),
      )
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id));
    return rows.map((row) =>
      StockMovement.restore({ ...row, type: row.type as MovementType }),
    );
  }

  async findByAppointmentId(appointmentId: string): Promise<StockMovement[]> {
    const rows = await this.db
      .select()
      .from(stockMovements)
      .where(
        withTenant(
          stockMovements,
          this.clinicId,
          eq(stockMovements.appointmentId, appointmentId),
        ),
      )
      .orderBy(desc(stockMovements.createdAt));
    return rows.map((row) =>
      StockMovement.restore({ ...row, type: row.type as MovementType }),
    );
  }

  async getOutflowCostInRange(
    from: Date,
    to: Date,
  ): Promise<OutflowCostByAppointment[]> {
    const rows = await this.db
      .select({
        appointmentId: stockMovements.appointmentId,
        totalCents: sql<number>`coalesce(sum(${stockMovements.quantity} * ${stockMovements.unitPriceCents}), 0)`,
      })
      .from(stockMovements)
      .where(
        withTenant(
          stockMovements,
          this.clinicId,
          and(
            eq(stockMovements.type, 'out'),
            gte(stockMovements.createdAt, from),
            lt(stockMovements.createdAt, to),
          ),
        ),
      )
      .groupBy(stockMovements.appointmentId);
    return rows.map((row) => ({
      appointmentId: row.appointmentId,
      totalCents: Number(row.totalCents),
    }));
  }

  async getOutflowQtyInRange(from: Date, to: Date): Promise<OutflowBySupply[]> {
    const rows = await this.db
      .select({
        supplyId: stockMovements.supplyId,
        totalQty: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)::int`,
      })
      .from(stockMovements)
      .where(
        withTenant(
          stockMovements,
          this.clinicId,
          and(
            eq(stockMovements.type, 'out'),
            gte(stockMovements.createdAt, from),
            lt(stockMovements.createdAt, to),
          ),
        ),
      )
      .groupBy(stockMovements.supplyId);
    return rows.map((row) => ({
      supplyId: row.supplyId,
      totalQty: Number(row.totalQty),
    }));
  }
}

export class DrizzleSupplyBatchRepository implements SupplyBatchRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(batch: SupplyBatch): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar lote de insumo (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: batch.id,
      clinicId: this.clinicId,
      supplyId: batch.supplyId,
      label: batch.label,
      expiresAt: batch.expiresAt,
      quantity: batch.quantity,
      remaining: batch.remaining,
      createdAt: batch.createdAt,
    };
    await this.db
      .insert(supplyBatches)
      .values(values)
      .onConflictDoUpdate({ target: supplyBatches.id, set: values });
  }

  async findActiveBySupplyId(supplyId: string): Promise<SupplyBatch[]> {
    const rows = await this.db
      .select()
      .from(supplyBatches)
      .where(
        withTenant(
          supplyBatches,
          this.clinicId,
          and(
            eq(supplyBatches.supplyId, supplyId),
            gt(supplyBatches.remaining, 0),
          ),
        ),
      )
      .orderBy(
        sql`${supplyBatches.expiresAt} ASC NULLS LAST`,
        asc(supplyBatches.createdAt),
      );
    return rows.map((row) => SupplyBatch.restore(row));
  }

  async findExpiringBefore(limit: Date): Promise<SupplyBatch[]> {
    const rows = await this.db
      .select()
      .from(supplyBatches)
      .where(
        withTenant(
          supplyBatches,
          this.clinicId,
          and(
            gt(supplyBatches.remaining, 0),
            lte(supplyBatches.expiresAt, limit),
          ),
        ),
      )
      .orderBy(asc(supplyBatches.expiresAt))
      .limit(MAX_ROWS);
    return rows.map((row) => SupplyBatch.restore(row));
  }
}

export class DrizzleFollowUpRepository implements FollowUpRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  private toEntity(row: typeof followUps.$inferSelect): FollowUp {
    return FollowUp.restore({ ...row, status: row.status as FollowUpStatus });
  }

  async save(followUp: FollowUp): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar retorno (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: followUp.id,
      clinicId: this.clinicId,
      patientId: followUp.patientId,
      appointmentId: followUp.appointmentId,
      dueDate: followUp.dueDate,
      reason: followUp.reason,
      status: followUp.status,
      createdAt: followUp.createdAt,
    };
    await this.db
      .insert(followUps)
      .values(values)
      .onConflictDoUpdate({ target: followUps.id, set: values });
  }

  async findById(id: string): Promise<FollowUp | null> {
    const rows = await this.db
      .select()
      .from(followUps)
      .where(withTenant(followUps, this.clinicId, eq(followUps.id, id)))
      .limit(1);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findAll(filter: FollowUpFilter = {}): Promise<FollowUp[]> {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(followUps.status, filter.status));
    if (filter.patientId)
      conditions.push(eq(followUps.patientId, filter.patientId));
    if (filter.dueBefore)
      conditions.push(lt(followUps.dueDate, filter.dueBefore));

    const rows = await this.db
      .select()
      .from(followUps)
      .where(
        withTenant(
          followUps,
          this.clinicId,
          conditions.length > 0 ? and(...conditions) : undefined,
        ),
      )
      .orderBy(asc(followUps.dueDate))
      .limit(MAX_ROWS);
    return rows.map((row) => this.toEntity(row));
  }

  /**
   * Sem `MAX_ROWS`: o job de lembretes precisa de todos os vencidos da empresa
   * (o corte em 500 deixava retornos sem recall — N3). Sempre filtrado pela
   * empresa do escopo, então o conjunto é o de uma clínica.
   */
  async findPendingDueBefore(dueBefore: Date): Promise<FollowUp[]> {
    const rows = await this.db
      .select()
      .from(followUps)
      .where(
        withTenant(
          followUps,
          this.clinicId,
          and(
            eq(followUps.status, 'pending'),
            lt(followUps.dueDate, dueBefore),
          ),
        ),
      )
      .orderBy(asc(followUps.dueDate));
    return rows.map((row) => this.toEntity(row));
  }
}
