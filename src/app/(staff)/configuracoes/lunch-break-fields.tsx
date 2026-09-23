'use client';

import { Checkbox, Input } from '@still-void/ui/react';
import { fromTimeInput, toTimeInput } from '@/domain/scheduling/time-of-day';

export interface LunchBreakValue {
  startMinute: number;
  endMinute: number;
}

const DEFAULT_LUNCH: LunchBreakValue = { startMinute: 720, endMinute: 780 };

/** Pausa de almoço da clínica: nenhum agendamento cai dentro dela. */
export function LunchBreakFields({
  value,
  onChange,
}: {
  value: LunchBreakValue | null;
  onChange: (value: LunchBreakValue | null) => void;
}) {
  return (
    <fieldset className="mt-4 max-w-md">
      <label className="flex items-center gap-2 font-medium text-sm">
        <Checkbox
          checked={value !== null}
          onChange={(e) => onChange(e.target.checked ? DEFAULT_LUNCH : null)}
        />
        Pausa para almoço
      </label>
      {value && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="font-medium text-sm">
            Início da pausa
            <Input
              type="time"
              step={300}
              value={toTimeInput(value.startMinute)}
              onChange={(e) =>
                onChange({
                  ...value,
                  startMinute: fromTimeInput(e.target.value),
                })
              }
              className="mt-1"
            />
          </label>
          <label className="font-medium text-sm">
            Fim da pausa
            <Input
              type="time"
              step={300}
              value={toTimeInput(value.endMinute)}
              onChange={(e) =>
                onChange({ ...value, endMinute: fromTimeInput(e.target.value) })
              }
              className="mt-1"
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}
