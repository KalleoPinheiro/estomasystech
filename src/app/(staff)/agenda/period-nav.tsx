'use client';

import { Button, Icon } from '@still-void/ui/react';
import type { AgendaPeriod, AgendaView } from './agenda-period';

const VIEWS: { value: AgendaView; label: string }[] = [
  { value: 'month', label: 'Mês' },
  { value: 'week', label: 'Semana' },
  { value: 'day', label: 'Dia' },
];

/** Navegação do período (anterior, rótulo, próximo) e a escolha da visão: mês/semana/dia no desktop, mês/dia no celular. */
export function PeriodNav({
  period,
  compact,
}: {
  period: AgendaPeriod;
  /** Celular: sem a visão semanal (7 colunas não cabem); a visão Dia é uma coluna só. */
  compact: boolean;
}) {
  const views = compact ? VIEWS.filter((v) => v.value !== 'week') : VIEWS;
  const unit = {
    month: { prev: 'Mês anterior', next: 'Próximo mês' },
    week: { prev: 'Semana anterior', next: 'Próxima semana' },
    day: { prev: 'Dia anterior', next: 'Próximo dia' },
  }[period.view];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        onClick={() => period.shift(-1)}
        aria-label={unit.prev}
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
        aria-label={unit.next}
        variant="outline"
        className="hover:bg-surface-2"
      >
        <Icon name="chevron-right" />
      </Button>
      <fieldset
        className="m-0 flex min-w-0 gap-1 border-0 p-0"
        aria-label="Visão da agenda"
      >
        {views.map((option) => (
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
    </div>
  );
}
