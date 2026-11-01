'use client';

import { Button } from '@still-void/ui/react';
import { useState } from 'react';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import type { StockMovementDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

const MOVEMENTS_VISIBLE_DEFAULT = 10;

export function MovementHistory({ supplyId }: { supplyId: string }) {
  const { data: movements, error } = useApiQuery<StockMovementDto[]>(
    `/api/supplies/${supplyId}/movements`,
  );
  const [showAll, setShowAll] = useState(false);

  if (error) return <ErrorAlert message={error} />;
  if (!movements) return <LoadingIndicator />;
  if (movements.length === 0)
    return <EmptyState message="Nenhuma movimentação registrada." />;

  const visible = showAll
    ? movements
    : movements.slice(0, MOVEMENTS_VISIBLE_DEFAULT);

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border text-sm">
        {visible.map((movement) => (
          <li key={movement.id} className="flex items-center gap-3 py-2">
            <span
              className={`inline-block w-14 rounded-full px-2 py-0.5 text-center font-medium text-xs ${
                movement.type === 'in'
                  ? 'bg-success-soft text-success'
                  : 'bg-surface-2 text-ink-2'
              }`}
            >
              {movement.type === 'in' ? '+' : '−'}
              {movement.quantity}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate">{movement.reason}</p>
              <p className="text-ink-3 text-xs">
                {formatDateTime(movement.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {!showAll && movements.length > MOVEMENTS_VISIBLE_DEFAULT && (
        <Button
          type="button"
          onClick={() => setShowAll(true)}
          variant="link"
          className="h-auto self-start p-0"
        >
          Ver mais ({movements.length - MOVEMENTS_VISIBLE_DEFAULT})
        </Button>
      )}
    </div>
  );
}
