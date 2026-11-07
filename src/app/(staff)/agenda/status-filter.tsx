'use client';

import { Button } from '@still-void/ui/react';
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from '@/domain/scheduling/appointment';
import { APPOINTMENT_STATUS_LABELS } from '@/lib/format';
import { STATUS_DOT_COLORS } from './status-colors';

interface StatusFilterProps {
  selected: readonly AppointmentStatus[];
  /** Contagem do período visível; ausente enquanto carrega (o chip mostra «—»). */
  counts: Record<AppointmentStatus, number> | null;
  /** A contagem falhou: o chip mostra «—» e o nome acessível diz «indisponível». */
  unavailable?: boolean;
  onToggle: (status: AppointmentStatus) => void;
}

/**
 * Chips de status da agenda (AGE-FLT-01/05). Os chips quebram em linhas, para
 * os cinco ficarem à vista sem rolagem em 360 px; `aria-pressed` marca o ativo.
 */
export function StatusFilter({
  selected,
  counts,
  unavailable = false,
  onToggle,
}: StatusFilterProps) {
  return (
    <fieldset
      className="m-0 mb-4 flex min-w-0 flex-wrap gap-2 border-0 p-0"
      aria-label="Filtrar por status"
      data-status-filter
    >
      {APPOINTMENT_STATUSES.map((status) => {
        const active = selected.includes(status);
        const count = counts?.[status];
        return (
          <Button
            key={status}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={active}
            // Nome acessível com unidade; o texto visível («Agendada 3» ou traço) continua dentro dele.
            aria-label={`${APPOINTMENT_STATUS_LABELS[status]}, ${typeof count === 'number' ? `${count} ${count === 1 ? 'consulta' : 'consultas'}` : unavailable ? 'indisponível' : 'carregando'}`}
            onClick={() => onToggle(status)}
            className={`h-9 gap-1.5 rounded-full px-2.5 font-medium text-xs ${active ? 'border-accent bg-accent-soft text-accent-ink' : 'text-ink-2'}`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${STATUS_DOT_COLORS[status]}`}
            />
            <span>{`${APPOINTMENT_STATUS_LABELS[status]} ${typeof count === 'number' ? count : '—'}`}</span>
          </Button>
        );
      })}
    </fieldset>
  );
}
