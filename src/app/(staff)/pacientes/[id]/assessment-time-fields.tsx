'use client';

import { Button, Input, NativeSelect } from '@still-void/ui/react';
import { useId } from 'react';
import { infectionCoherenceWarnings } from '@/domain/clinical/wound-time';
import {
  EXUDATE_LABELS,
  EXUDATE_TYPE_LABELS,
  INFECTION_LEVEL_LABELS,
  INFECTION_SIGN_LABELS,
  WOUND_EDGE_LABELS,
} from '@/lib/format';
import {
  criterionHint,
  EXUDATE_CRITERIA,
  EXUDATE_TYPE_CRITERIA,
  INFECTION_LEVEL_CRITERIA,
  TISSUE_PERCENT_MAX,
  TISSUE_TYPE_CRITERIA,
  tissuePercentTotal,
  WOUND_EDGE_CRITERIA,
} from '@/lib/wound-criteria';

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

/** Legenda curta do critério, ligada ao campo por `aria-describedby`. */
function CriterionHint({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="mt-1 text-ink-3 text-xs">
      {text}
    </p>
  );
}

interface CriterionSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Record<string, string>;
  criteria: Record<string, string>;
  emptyHint: string;
}

/** Lista fechada com a legenda do critério da opção escolhida logo abaixo (#955). */
function CriterionSelect({
  label,
  value,
  onChange,
  options,
  criteria,
  emptyHint,
}: CriterionSelectProps) {
  const hintId = useId();
  return (
    <div>
      <label className="font-medium text-sm">
        {label}
        <NativeSelect
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hintId}
          className="mt-1"
        >
          <option value="">—</option>
          {Object.entries(options).map(([code, optionLabel]) => (
            <option key={code} value={code}>
              {optionLabel}
            </option>
          ))}
        </NativeSelect>
      </label>
      <CriterionHint
        id={hintId}
        text={criterionHint(criteria, value, emptyHint)}
      />
    </div>
  );
}

/** Rótulos do tecido predominante com o escore do PUSH 3.0. */
const TISSUE_TYPE_OPTIONS: Record<string, string> = {
  closed: 'Fechado (0)',
  epithelial: 'Epitelização (1)',
  granulation: 'Granulação (2)',
  slough: 'Esfacelo (3)',
  necrotic: 'Necrose (4)',
};

const EXUDATE_SCALE_HINT =
  'Pela saturação da cobertura: baixo menos de 25%, moderado de 25% a 75%, alto mais de 75%.';

interface WoundBaseFieldsProps {
  tissueType: string;
  exudate: string;
  onTissueType: (value: string) => void;
  onExudate: (value: string) => void;
}

/** Tecido predominante (T) e quantidade de exsudato (U), cada um com o critério da opção. */
export function WoundBaseFields({
  tissueType,
  exudate,
  onTissueType,
  onExudate,
}: WoundBaseFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* Valores canônicos do PUSH 3.0 — texto livre legado permanece no histórico. */}
      <CriterionSelect
        label="Tecido predominante"
        value={tissueType}
        onChange={onTissueType}
        options={TISSUE_TYPE_OPTIONS}
        criteria={TISSUE_TYPE_CRITERIA}
        emptyHint="O tecido que ocupa a maior parte do leito."
      />
      <CriterionSelect
        label="Exsudato"
        value={exudate}
        onChange={onExudate}
        options={EXUDATE_LABELS}
        criteria={EXUDATE_CRITERIA}
        emptyHint={EXUDATE_SCALE_HINT}
      />
    </div>
  );
}

/** Soma dos percentuais de tecido, com aviso quando passa de 100% (o registro recusa). */
function TissuePercentTotal({ values }: { values: TimeFormValues }) {
  const total = tissuePercentTotal(
    TISSUE_PERCENT_FIELDS.map(({ key }) => values[key]),
  );
  if (total === null) {
    return null;
  }
  if (total > TISSUE_PERCENT_MAX) {
    return (
      <p
        key="acima"
        role="alert"
        className="mt-3 rounded bg-warning-soft px-3 py-2 text-sm text-warning"
      >
        Soma: {total}%. Passa de {TISSUE_PERCENT_MAX}%: ajuste os percentuais
        antes de registrar.
      </p>
    );
  }
  return (
    <p key="soma" role="status" className="mt-3 text-ink-3 text-sm">
      Soma: {total}%
    </p>
  );
}

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
        <TissuePercentTotal values={values} />
      </fieldset>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 font-semibold text-ink-3 text-xs uppercase">
          Infecção / Inflamação
        </legend>
        <CriterionSelect
          label="Nível"
          value={values.infectionLevel}
          onChange={(infectionLevel) => onChange({ infectionLevel })}
          options={INFECTION_LEVEL_LABELS}
          criteria={INFECTION_LEVEL_CRITERIA}
          emptyHint="Do leito para o corpo: local até 2 cm da borda, disseminada além disso, sistêmica com febre ou mal-estar."
        />
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
        <CriterionSelect
          label="Aspecto da drenagem"
          value={values.exudateType}
          onChange={(exudateType) => onChange({ exudateType })}
          options={EXUDATE_TYPE_LABELS}
          criteria={EXUDATE_TYPE_CRITERIA}
          emptyHint="Cor e consistência do exsudato na cobertura retirada."
        />
        <CriterionSelect
          label="Bordas"
          value={values.woundEdges}
          onChange={(woundEdges) => onChange({ woundEdges })}
          options={WOUND_EDGE_LABELS}
          criteria={WOUND_EDGE_CRITERIA}
          emptyHint="Como a borda se liga ao leito e à pele ao redor."
        />
      </div>
    </>
  );
}
