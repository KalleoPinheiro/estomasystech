import 'server-only';
import { GetSupplyInsights } from '@/application/inventory/get-supply-insights';
import { ListSupplies } from '@/application/inventory/list-supplies';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  type StockMovementDto,
  type SupplyDto,
  toStockMovementDto,
  toSupplyDto,
} from '@/lib/dto';

/** Insumos da empresa da sessão — a mesma resposta de `GET /api/supplies` e o estoque baixo da tela Hoje. */
export async function listSuppliesFor(session: Session): Promise<SupplyDto[]> {
  const { supplies } = await getRepositories(sessionScope(session));
  const result = await new ListSupplies(supplies).execute();
  return result.map(({ supply }) => toSupplyDto(supply));
}

export interface SupplyInsightsDto {
  bySupply: Array<{
    supplyId: string;
    avgDailyOut: number;
    daysToStockout: number | null;
  }>;
  expiringBatches: Array<{
    batchId: string;
    supplyId: string;
    supplyName: string;
    label: string | null;
    expiresAt: string;
    remaining: number;
    isExpired: boolean;
  }>;
}

/** Previsão de ruptura e lotes a vencer — a mesma resposta de `GET /api/supplies/insights`. */
export async function getSupplyInsightsFor(
  session: Session,
): Promise<SupplyInsightsDto> {
  const { supplies, stockMovements, supplyBatches } = await getRepositories(
    sessionScope(session),
  );
  const insights = await new GetSupplyInsights(
    supplies,
    stockMovements,
    supplyBatches,
  ).execute();
  return {
    bySupply: insights.bySupply,
    expiringBatches: insights.expiringBatches.map((batch) => ({
      ...batch,
      expiresAt: batch.expiresAt.toISOString(),
    })),
  };
}

/** Histórico de movimentações do insumo — a mesma resposta de `GET /api/supplies/:id/movements`. */
export async function listSupplyMovementsFor(
  session: Session,
  supplyId: string,
): Promise<StockMovementDto[]> {
  const { stockMovements } = await getRepositories(sessionScope(session));
  const movements = await stockMovements.findBySupplyId(supplyId);
  return movements.map(toStockMovementDto);
}
