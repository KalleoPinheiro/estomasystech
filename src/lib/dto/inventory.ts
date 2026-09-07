import type { StockMovement } from '@/domain/inventory/stock-movement';
import type { Supply } from '@/domain/inventory/supply';

export interface SupplyDto {
  id: string;
  name: string;
  unit: string;
  minQty: number;
  priceCents: number;
  stockQty: number;
  isLowStock: boolean;
  /** Zero é mais grave que "baixo" — severidade visual escala (MAT-01/02). */
  isOutOfStock: boolean;
  active: boolean;
}

export const toSupplyDto = (supply: Supply): SupplyDto => ({
  id: supply.id,
  name: supply.name,
  unit: supply.unit,
  minQty: supply.minQty,
  priceCents: supply.priceCents,
  stockQty: supply.stockQty,
  isLowStock: supply.isLowStock,
  isOutOfStock: supply.isOutOfStock,
  active: supply.isActive,
});

export interface StockMovementDto {
  id: string;
  supplyId: string;
  type: string;
  quantity: number;
  reason: string;
  appointmentId: string | null;
  unitPriceCents: number | null;
  createdAt: string;
}

export const toStockMovementDto = (
  movement: StockMovement,
): StockMovementDto => ({
  id: movement.id,
  supplyId: movement.supplyId,
  type: movement.type,
  quantity: movement.quantity,
  reason: movement.reason,
  appointmentId: movement.appointmentId,
  unitPriceCents: movement.unitPriceCents,
  createdAt: movement.createdAt.toISOString(),
});
