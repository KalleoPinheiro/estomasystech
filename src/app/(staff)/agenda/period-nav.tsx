'use client';

import { Button, Icon } from '@still-void/ui/react';
import type { AgendaPeriod, AgendaView } from './agenda-period';

const VIEWS: { value: AgendaView; label: string }[] = [
  { value: 'month', label: 'Mês' },
  { value: 'week', label: 'Semana' },
];

/** Navegação do período (anterior, rótulo, próximo) e, no desktop, a escolha mês/semana. */
export function PeriodNav({
  period,
  showViewToggle,
}: {
  period: AgendaPeriod;
  /** Celular: só o mês compacto, sem a visão semanal. */
  showViewToggle: boolean;
}) {
  const isWeek = period.view === 'week';
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        onClick={() => period.shift(-1)}
        aria-label={isWeek ? 'Semana anterior' : 'Mês anterior'}
        variant="outline"
        className="hover:bg-surface-2"
      >
        <Icon name="chevron-left" />
      </Button>
      <span className="min-w-48 flex-1 text-center font-semibold text-lg md:flex-none">
        {period.label}
      </span>
      <Button
        type="button"
        onClick={() => period.shift(1)}
        aria-label={isWeek ? 'Próxima semana' : 'Próximo mês'}
        variant="outline"
        className="hover:bg-surface-2"
      >
        <Icon name="chevron-right" />
      </Button>
      {showViewToggle && (
        <fieldset
          className="m-0 flex min-w-0 gap-1 border-0 p-0"
          aria-label="Visão da agenda"
        >
          {VIEWS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={period.view === option.value ? 'accent' : 'outline'}
              aria-pressed={period.view === option.value}
              onClick={() => period.setView(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </fieldset>
      )}
    </div>
  );
}
