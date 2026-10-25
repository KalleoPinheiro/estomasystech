'use client';

import { Button } from '@still-void/ui/react';
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from '@/domain/scheduling/appointment';
import { APPOINTMENT_STATUS_LABELS } from '@/lib/format';

interface StatusFilterProps {
  selected: readonly AppointmentStatus[];
  /** Contagem do período visível; ausente enquanto carrega (o chip mostra «—»). */
  counts: Record<AppointmentStatus, number> | null;
  /** A contagem falhou: o chip mostra «—» e o nome acessível diz «indisponível». */
  unavailable?: boolean;
  onToggle: (status: AppointmentStatus) => void;
}

/**
 * Chips de status da agenda (AGE-FLT-01/05). Linha rolável na horizontal, para
 * a página nunca ganhar rolagem lateral em 360 px; `aria-pressed` marca o ativo.
 */
export function StatusFilter({
  selected,
  counts,
  unavailable = false,
  onToggle,
}: StatusFilterProps) {
  return (
    <fieldset
      className="m-0 mb-4 flex min-w-0 gap-2 overflow-x-auto border-0 p-0"
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
            variant={active ? 'accent' : 'outline'}
            aria-pressed={active}
            // Nome acessível com unidade; o texto visível («Agendada 3» ou traço) continua dentro dele.
            aria-label={`${APPOINTMENT_STATUS_LABELS[status]}, ${typeof count === 'number' ? `${count} ${count === 1 ? 'consulta' : 'consultas'}` : unavailable ? 'indisponível' : 'carregando'}`}
            onClick={() => onToggle(status)}
            className="shrink-0"
          >
            {APPOINTMENT_STATUS_LABELS[status]}
            {` ${typeof count === 'number' ? count : '—'}`}
          </Button>
        );
      })}
    </fieldset>
  );
}
