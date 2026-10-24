'use client';

import { Button, Input, NativeSelect } from '@still-void/ui/react';
import { infectionCoherenceWarnings } from '@/domain/clinical/wound-time';
import {
  EXUDATE_TYPE_LABELS,
  INFECTION_LEVEL_LABELS,
  INFECTION_SIGN_LABELS,
  WOUND_EDGE_LABELS,
} from '@/lib/format';

/** Campos do TIME que o formulário de ferida acrescenta ao tecido e à umidade já existentes. */
export interface TimeFormValues {
  infectionLevel: string;
  infectionSigns: string[];
  woundEdges: string;
  exudateType: string;
  granulationPct: string;
  epithelialPct: string;
  sloughPct: string;
  necroticPct: string;
}

export const EMPTY_TIME_VALUES: TimeFormValues = {
  infectionLevel: '',
  infectionSigns: [],
  woundEdges: '',
  exudateType: '',
  granulationPct: '',
  epithelialPct: '',
  sloughPct: '',
  necroticPct: '',
};

const toNumberOrNull = (value: string): number | null =>
  value ? Number(value) : null;

export const toTimePayload = (values: TimeFormValues) => ({
  infectionLevel: values.infectionLevel || null,
  infectionSigns:
    values.infectionSigns.length > 0 ? values.infectionSigns.join(',') : null,
  woundEdges: values.woundEdges || null,
  exudateType: values.exudateType || null,
  granulationPct: toNumberOrNull(values.granulationPct),
  epithelialPct: toNumberOrNull(values.epithelialPct),
  sloughPct: toNumberOrNull(values.sloughPct),
  necroticPct: toNumberOrNull(values.necroticPct),
});

const TISSUE_PERCENT_FIELDS = [
  { key: 'granulationPct', label: 'Granulação (%)' },
  { key: 'epithelialPct', label: 'Epitelização (%)' },
  { key: 'sloughPct', label: 'Esfacelo (%)' },
  { key: 'necroticPct', label: 'Necrose (%)' },
] as const;

interface TimeFieldsProps {
  values: TimeFormValues;
  onChange: (patch: Partial<TimeFormValues>) => void;
}

/** I (Infecção/Inflamação), T (percentual de tecido), U (tipo de exsudato) e B (bordas) do protocolo TIME. */
export function TimeFields({ values, onChange }: TimeFieldsProps) {
  const toggleSign = (code: string) =>
    onChange({
      infectionSigns: values.infectionSigns.includes(code)
        ? values.infectionSigns.filter((c) => c !== code)
        : [...values.infectionSigns, code],
    });

  const warnings = infectionCoherenceWarnings(
    values.infectionLevel,
    values.infectionSigns.join(','),
  );

  return (
    <>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 font-semibold text-ink-3 text-xs uppercase">
          Tecido — percentual no leito da ferida (soma até 100%)
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TISSUE_PERCENT_FIELDS.map(({ key, label }) => (
            <label key={key} className="font-medium text-sm">
              {label}
              <Input
                type="number"
                min="0"
                max="100"
                value={values[key]}
                onChange={(e) => onChange({ [key]: e.target.value })}
                className="mt-1"
              />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 font-semibold text-ink-3 text-xs uppercase">
          Infecção / Inflamação
        </legend>
        <label className="font-medium text-sm">
          Nível
          <NativeSelect
            value={values.infectionLevel}
            onChange={(e) => onChange({ infectionLevel: e.target.value })}
            className="mt-1"
          >
            <option value="">—</option>
            {Object.entries(INFECTION_LEVEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <p className="mt-3 mb-1 font-medium text-sm">Sinais observados</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(INFECTION_SIGN_LABELS).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              aria-pressed={values.infectionSigns.includes(value)}
              onClick={() => toggleSign(value)}
              className={`rounded-full px-2.5 py-1 font-medium text-xs ${
                values.infectionSigns.includes(value)
                  ? 'bg-danger text-white'
                  : 'border border-border-strong text-ink-2 hover:bg-surface-2'
              }`}
              variant="outline"
            >
              {label}
            </Button>
          ))}
        </div>
        {warnings.length > 0 && (
          <ul
            role="status"
            className="mt-3 list-disc rounded bg-warning-soft py-2 pr-3 pl-7 text-sm text-warning"
          >
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </fieldset>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="font-medium text-sm">
          Aspecto da drenagem
          <NativeSelect
            value={values.exudateType}
            onChange={(e) => onChange({ exudateType: e.target.value })}
            className="mt-1"
          >
            <option value="">—</option>
            {Object.entries(EXUDATE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="font-medium text-sm">
          Bordas
          <NativeSelect
            value={values.woundEdges}
            onChange={(e) => onChange({ woundEdges: e.target.value })}
            className="mt-1"
          >
            <option value="">—</option>
            {Object.entries(WOUND_EDGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
    </>
  );
}
