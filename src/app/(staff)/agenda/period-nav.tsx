'use client';

import { Button, Icon } from '@still-void/ui/react';
import type { AgendaPeriod, AgendaView } from './agenda-period';

const VIEWS: { value: AgendaView; label: string }[] = [
  { value: 'month', label: 'Mês' },
  { value: 'week', label: 'Semana' },
  { value: 'day', label: 'Dia' },
];

/** Navegação do período (anterior, rótulo, próximo) e, no desktop, a escolha mês/semana/dia. */
export function PeriodNav({
  period,
  showViewToggle,
}: {
  period: AgendaPeriod;
  /** Celular: só o mês compacto, sem as visões semanal e diária. */
  showViewToggle: boolean;
}) {
  const unit = {
    month: { prev: 'Mês anterior', next: 'Próximo mês' },
    week: { prev: 'Semana anterior', next: 'Próxima semana' },
    day: { prev: 'Dia anterior', next: 'Próximo dia' },
  }[period.view];
  return (
    <div className="flex items-center gap-3">
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
