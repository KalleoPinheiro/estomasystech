import { SummaryCard } from '@/components/summary-card';
import type { Session } from '@/lib/auth/session';
import { loadBlock } from '@/lib/server/data/load-block';
import { listSuppliesFor } from '@/lib/server/data/supplies';

const LOW_STOCK_CAP = 6;

export async function LowStockCard({ session }: { session: Session }) {
  const { data, error } = await loadBlock(() => listSuppliesFor(session));
  const lowStock = (data ?? []).filter((s) => s.active && s.isLowStock);

  return (
    <SummaryCard
      title="Estoque baixo"
      href={{ label: 'Ver materiais', url: '/materiais' }}
      error={error}
      isEmpty={lowStock.length === 0}
      emptyMessage="Nenhum insumo abaixo do mínimo."
    >
      <ul className="divide-y divide-border text-sm">
        {lowStock.slice(0, LOW_STOCK_CAP).map((supply) => (
          <li key={supply.id} className="flex justify-between py-2">
            <span className="truncate">{supply.name}</span>
            <span className="shrink-0 font-medium text-warning">
              {supply.stockQty}/{supply.minQty} {supply.unit}
            </span>
          </li>
        ))}
      </ul>
    </SummaryCard>
  );
}
