'use client';

import {
  Button,
  Card,
  Input,
  NativeSelect,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { Modal } from '@/components/modal';
import { SafeForm } from '@/components/safe-form';
import { StatusBadge } from '@/components/status-badge';
import { unwrapAction } from '@/lib/action-result';
import type {
  CarePlanDetailDto,
  CarePlanDto,
  CarePlanOutcomeDto,
  ClinicNursingDiagnosisDto,
  ConditionDto,
  NursingDiagnosisDto,
  NursingInterventionDto,
  NursingOutcomeDto,
} from '@/lib/dto';
import {
  CARE_PLAN_DIAGNOSIS_TYPE_LABELS,
  CARE_PLAN_STATUS_LABELS,
  diagnosisCodeLabel,
  formatDateTime,
  INTERVENTION_PRIORITY_LABELS,
  outcomeStatusLabel,
  pesSentence,
} from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import {
  addCarePlanDiagnosis,
  evaluateCarePlanOutcome,
  openCarePlan,
  prescribeCarePlanIntervention,
  prescribeCarePlanOutcome,
  recordCarePlanIntervention,
  resolveCarePlan,
} from './actions/plano-cuidados';

interface CarePlansSectionProps {
  patientId: string;
  conditions: ConditionDto[];
  plans: CarePlanDto[];
  error: string | null;
  isLoading: boolean;
  onChanged: () => void;
  onRetry: () => void;
}

export function CarePlansSection({
  patientId,
  conditions,
  plans,
  error,
  isLoading,
  onChanged,
  onRetry,
}: CarePlansSectionProps) {
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-ink-3 text-sm">
          Processo de Enfermagem: diagnóstico (NANDA-I) → resultado esperado
          (NOC) → intervenção (NIC).
        </p>
        <Button
          type="button"
          onClick={() => setCreating(true)}
          variant="accent"
        >
          + Novo plano
        </Button>
      </div>

      {isLoading ? (
        <LoadingIndicator />
      ) : error ? (
        <ErrorAlert message={error} onRetry={onRetry} />
      ) : plans.length === 0 ? (
        <EmptyState message="Nenhum plano de cuidados aberto." />
      ) : (
        <ul className="flex flex-col gap-3">
          {plans.map((plan) => {
            const condition = conditions.find(
              (item) => item.id === plan.conditionId,
            );
            const isOpen = expanded === plan.id;
            return (
              <Card as="li" key={plan.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="mr-2 font-medium">
                      {condition ? condition.title : 'Plano geral do paciente'}
                    </span>
                    <StatusBadge
                      status={
                        plan.status === 'active' ? 'confirmed' : 'completed'
                      }
                      label={CARE_PLAN_STATUS_LABELS[plan.status]}
                    />
                  </div>
                  <div className="flex gap-3 text-sm">
                    <Button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : plan.id)}
                      variant="link"
                      className="h-auto p-0 text-accent-ink"
                    >
                      {isOpen ? 'Ocultar plano' : 'Ver plano'}
                    </Button>
                    <a
                      href={`/documentos/plano-cuidados/${plan.id}`}
                      className="font-medium text-accent-ink hover:underline"
                    >
                      Imprimir plano
                    </a>
                  </div>
                </div>
                {isOpen && (
                  <CarePlanPanel planId={plan.id} onChanged={onChanged} />
                )}
              </Card>
            );
          })}
        </ul>
      )}

      {creating && (
        <Modal
          title="Novo plano de cuidados"
          onClose={() => setCreating(false)}
        >
          <OpenCarePlanForm
            patientId={patientId}
            conditions={conditions}
            onSaved={() => {
              setCreating(false);
              onChanged();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function OpenCarePlanForm({
  patientId,
  conditions,
  onSaved,
}: {
  patientId: string;
  conditions: ConditionDto[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [conditionId, setConditionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        openCarePlan({ patientId, body: { conditionId: conditionId || null } }),
      );
      toast({ description: 'Plano de cuidados aberto', variant: 'success' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir plano');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Condição associada
        <NativeSelect
          value={conditionId}
          onChange={(e) => setConditionId(e.target.value)}
          className="mt-1"
        >
          <option value="">Geral (sem condição específica)</option>
          {conditions.map((condition) => (
            <option key={condition.id} value={condition.id}>
              {condition.title}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Abrindo…' : 'Abrir plano'}
      </Button>
    </SafeForm>
  );
}

function CarePlanPanel({
  planId,
  onChanged,
}: {
  planId: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const {
    data: detail,
    error,
    refresh,
  } = useApiQuery<CarePlanDetailDto>(`/api/care-plans/${planId}`);
  const [addingDiagnosis, setAddingDiagnosis] = useState(false);
  const [addingOutcome, setAddingOutcome] = useState(false);
  const [addingIntervention, setAddingIntervention] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <ErrorAlert message={error} />;
  if (!detail) return null;

  const isActive = detail.plan.status === 'active';
  const firstDiagnosisCode = detail.diagnoses[0]?.diagnosisCode ?? null;

  const resolvePlan = async () => {
    try {
      await unwrapAction(resolveCarePlan({ id: planId }));
      toast({ description: 'Plano de cuidados encerrado', variant: 'success' });
      refresh();
      onChanged();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao resolver plano',
      );
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-4 border-border border-t pt-3">
      {actionError && <ErrorAlert message={actionError} />}

      <DiagnosesSection
        diagnoses={detail.diagnoses}
        isActive={isActive}
        onAdd={() => setAddingDiagnosis(true)}
      />

      <OutcomesSection
        outcomes={detail.outcomes}
        isActive={isActive}
        onAdd={() => setAddingOutcome(true)}
        onEvaluated={refresh}
      />

      <InterventionsSection
        interventions={detail.interventions}
        isActive={isActive}
        onAdd={() => setAddingIntervention(true)}
        onRecorded={refresh}
      />

      {isActive && (
        <ConfirmAction
          trigger={
            <Button
              type="button"
              variant="link"
              className="h-auto self-start p-0 text-ink-3"
            >
              Resolver plano
            </Button>
          }
          title="Resolver o plano de cuidados?"
          description="O plano é travado permanentemente. Não existe ação de reabrir depois."
          confirmLabel="Confirmar"
          variant="danger"
          onConfirm={() => resolvePlan()}
        />
      )}

      {addingDiagnosis && (
        <Modal
          title="Prescrever diagnóstico"
          onClose={() => setAddingDiagnosis(false)}
        >
          <AddDiagnosisForm
            carePlanId={planId}
            onSaved={() => {
              setAddingDiagnosis(false);
              refresh();
            }}
          />
        </Modal>
      )}
      {addingOutcome && (
        <Modal
          title="Prescrever resultado esperado"
          onClose={() => setAddingOutcome(false)}
        >
          <PrescribeOutcomeForm
            carePlanId={planId}
            diagnosisCode={firstDiagnosisCode}
            onSaved={() => {
              setAddingOutcome(false);
              refresh();
            }}
          />
        </Modal>
      )}
      {addingIntervention && (
        <Modal
          title="Prescrever intervenção"
          onClose={() => setAddingIntervention(false)}
        >
          <PrescribeInterventionForm
            carePlanId={planId}
            diagnosisCode={firstDiagnosisCode}
            onSaved={() => {
              setAddingIntervention(false);
              refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function DiagnosesSection({
  diagnoses,
  isActive,
  onAdd,
}: {
  diagnoses: CarePlanDetailDto['diagnoses'];
  isActive: boolean;
  onAdd: () => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-ink text-sm">
          Diagnósticos (NANDA-I)
        </h4>
        {isActive && (
          <Button
            type="button"
            onClick={onAdd}
            variant="link"
            className="h-auto p-0 text-accent-ink"
          >
            + Diagnóstico
          </Button>
        )}
      </div>
      {diagnoses.length === 0 ? (
        <EmptyState message="Nenhum diagnóstico prescrito." />
      ) : (
        <ul className="flex flex-col gap-2">
          {diagnoses.map((diagnosis) => (
            <li key={diagnosis.id} className="rounded-lg bg-bg p-3 text-sm">
              <span className="mr-2 rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-ink text-xs">
                {diagnosisCodeLabel(diagnosis.diagnosisCode)} ·{' '}
                {CARE_PLAN_DIAGNOSIS_TYPE_LABELS[diagnosis.type]}
              </span>
              <p className="mt-1">{pesSentence(diagnosis)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OutcomesSection({
  outcomes,
  isActive,
  onAdd,
  onEvaluated,
}: {
  outcomes: CarePlanOutcomeDto[];
  isActive: boolean;
  onAdd: () => void;
  onEvaluated: () => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-ink text-sm">
          Resultados esperados (NOC)
        </h4>
        {isActive && (
          <Button
            type="button"
            onClick={onAdd}
            variant="link"
            className="h-auto p-0 text-accent-ink"
          >
            + Resultado
          </Button>
        )}
      </div>
      {outcomes.length === 0 ? (
        <EmptyState message="Nenhum resultado prescrito." />
      ) : (
        <ul className="flex flex-col gap-2">
          {outcomes.map((outcome) => (
            <OutcomeRow
              key={outcome.id}
              outcome={outcome}
              canEvaluate={isActive}
              onEvaluated={onEvaluated}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function InterventionRow({
  intervention,
  isActive,
  onRecorded,
}: {
  intervention: CarePlanDetailDto['interventions'][number];
  isActive: boolean;
  onRecorded: () => void;
}) {
  return (
    <li className="rounded-lg bg-bg p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium">{intervention.interventionLabel}</span>
          <span className="ml-2 text-ink-3 text-xs">
            {intervention.frequency} · prioridade{' '}
            {INTERVENTION_PRIORITY_LABELS[intervention.priority]}
          </span>
        </div>
        {isActive && (
          <RecordInterventionButton
            interventionId={intervention.id}
            onRecorded={onRecorded}
          />
        )}
      </div>
      {intervention.records.length > 0 && (
        <p className="mt-1 text-ink-3 text-xs">
          Última execução: {formatDateTime(intervention.records[0].performedAt)}{' '}
          · total {intervention.records.length}
        </p>
      )}
    </li>
  );
}

function InterventionsSection({
  interventions,
  isActive,
  onAdd,
  onRecorded,
}: {
  interventions: CarePlanDetailDto['interventions'];
  isActive: boolean;
  onAdd: () => void;
  onRecorded: () => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-ink text-sm">Intervenções (NIC)</h4>
        {isActive && (
          <Button
            type="button"
            onClick={onAdd}
            variant="link"
            className="h-auto p-0 text-accent-ink"
          >
            + Intervenção
          </Button>
        )}
      </div>
      {interventions.length === 0 ? (
        <EmptyState message="Nenhuma intervenção prescrita." />
      ) : (
        <ul className="flex flex-col gap-2">
          {interventions.map((intervention) => (
            <InterventionRow
              key={intervention.id}
              intervention={intervention}
              isActive={isActive}
              onRecorded={onRecorded}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function scoreBadgeClass(current: number | null, target: number): string {
  if (current == null) return 'bg-surface-2 text-ink-2';
  if (current >= target) return 'bg-success-soft text-success';
  return 'bg-warning-soft text-warning';
}

function OutcomeRow({
  outcome,
  canEvaluate,
  onEvaluated,
}: {
  outcome: CarePlanOutcomeDto;
  canEvaluate: boolean;
  onEvaluated: () => void;
}) {
  const [evaluating, setEvaluating] = useState(false);

  return (
    <li className="rounded-lg bg-bg p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{outcome.outcomeLabel}</span>
        {canEvaluate && (
          <Button
            type="button"
            onClick={() => setEvaluating(true)}
            variant="link"
            className="h-auto p-0 text-accent-ink"
          >
            Avaliar
          </Button>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-ink-2 text-xs">
        <span>Basal {outcome.baselineScore}</span>
        <span aria-hidden="true">→</span>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${scoreBadgeClass(outcome.currentScore, outcome.targetScore)}`}
        >
          Atual {outcome.currentScore ?? '—'}
        </span>
        <span aria-hidden="true">→</span>
        <span>Meta {outcome.targetScore}</span>
        {outcome.isAchieved != null && (
          <span className="ml-1 font-medium">
            {outcomeStatusLabel(outcome)}
          </span>
        )}
      </div>
      {outcome.evaluations.length > 0 && (
        <p className="mt-1 text-ink-3 text-xs">
          Última avaliação: {formatDateTime(outcome.evaluations[0].evaluatedAt)}{' '}
          · {outcome.evaluations.length} avaliação(ões) no histórico
        </p>
      )}
      {evaluating && (
        <Modal
          title={`Avaliar — ${outcome.outcomeLabel}`}
          onClose={() => setEvaluating(false)}
        >
          <EvaluateOutcomeForm
            outcome={outcome}
            onSaved={() => {
              setEvaluating(false);
              onEvaluated();
            }}
          />
        </Modal>
      )}
    </li>
  );
}

function RecordInterventionButton({
  interventionId,
  onRecorded,
}: {
  interventionId: string;
  onRecorded: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = async () => {
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        recordCarePlanIntervention({ id: interventionId, body: {} }),
      );
      toast({ description: 'Execução registrada', variant: 'success' });
      onRecorded();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao registrar execução',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <span>
      <Button
        type="button"
        disabled={saving}
        onClick={() => void record()}
        variant="link"
        className="h-auto p-0 text-accent-ink"
      >
        {saving ? 'Registrando…' : 'Registrar execução'}
      </Button>
      {error && <span className="ml-2 text-danger text-xs">{error}</span>}
    </span>
  );
}

/** Busca no catálogo com preview dos termos ligados ao primeiro diagnóstico do plano, quando houver. */
function useTaxonomySearch<T>(
  kind: 'diagnoses' | 'outcomes' | 'interventions',
) {
  const [term, setTerm] = useState('');
  const query =
    term.trim().length >= 2
      ? `/api/taxonomy/${kind}?q=${encodeURIComponent(term)}`
      : null;
  const { data } = useApiQuery<T[]>(query);
  return { term, setTerm, results: data ?? [] };
}

interface TaxonomyOption {
  code: string;
  label: string;
}

/** Prioriza os termos ligados ao diagnóstico até o usuário digitar uma busca própria. */
function pickOptions<T>(term: string, searched: T[], suggested: T[]): T[] {
  return term.trim().length >= 2 ? searched : suggested;
}

function searchInputValue(
  selected: TaxonomyOption | null,
  term: string,
): string {
  return selected ? `${selected.code} — ${selected.label}` : term;
}

function TaxonomyOptionList<T extends TaxonomyOption>({
  options,
  linkedHint,
  onSelect,
}: {
  options: T[];
  linkedHint: string | null;
  onSelect: (item: T) => void;
}) {
  if (options.length === 0) {
    return null;
  }
  return (
    <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
      {options.map((item) => (
        <li key={item.code}>
          <Button
            type="button"
            onClick={() => onSelect(item)}
            variant="ghost"
            className="w-full text-left hover:bg-accent-soft"
          >
            <span className="font-medium">{item.code}</span> — {item.label}
            {linkedHint && (
              <span className="ml-2 text-accent-ink text-xs">{linkedHint}</span>
            )}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Opção de diagnóstico na busca do plano (#954): catálogo da clínica primeiro, depois o global. */
type DiagnosisOption =
  | { source: 'clinica'; id: string; code: string | null; label: string }
  | { source: 'global'; id: null; code: string; label: string };

type DiagnosisTypeOption = (typeof DIAGNOSIS_TYPE_OPTIONS)[number];
const DIAGNOSIS_TYPE_OPTIONS = [
  'real',
  'risco',
  'promocao-saude',
  'sindrome',
] as const;

const optionKey = (option: DiagnosisOption): string =>
  option.source === 'clinica'
    ? `clinica:${option.id}`
    : `global:${option.code}`;

const optionText = (option: DiagnosisOption): string =>
  option.code ? `${option.code} — ${option.label}` : option.label;

/** Junta as duas buscas; item da clínica com o mesmo código esconde o global. A busca da clínica
 * que falhar não esconde o catálogo global. */
function useDiagnosisSearch() {
  const { term, setTerm, results } =
    useTaxonomySearch<NursingDiagnosisDto>('diagnoses');
  const query =
    term.trim().length >= 2
      ? `/api/taxonomy/clinic-diagnoses?q=${encodeURIComponent(term)}`
      : null;
  const { data: clinic } = useApiQuery<ClinicNursingDiagnosisDto[]>(query);
  const clinicOptions: DiagnosisOption[] = (clinic ?? []).map((item) => ({
    source: 'clinica',
    id: item.id,
    code: item.code,
    label: item.label,
  }));
  const clinicCodes = new Set(clinicOptions.map((item) => item.code));
  const globalOptions: DiagnosisOption[] = results
    .filter((item) => !clinicCodes.has(item.code))
    .map((item) => ({
      source: 'global',
      id: null,
      code: item.code,
      label: item.label,
    }));
  return { term, setTerm, options: [...clinicOptions, ...globalOptions] };
}

function DiagnosisOptionList({
  options,
  onSelect,
}: {
  options: DiagnosisOption[];
  onSelect: (option: DiagnosisOption) => void;
}) {
  if (options.length === 0) return null;
  return (
    <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
      {options.map((option) => (
        <li key={optionKey(option)}>
          <Button
            type="button"
            onClick={() => onSelect(option)}
            variant="ghost"
            className="w-full text-left hover:bg-accent-soft"
          >
            {option.code && <span className="font-medium">{option.code}</span>}
            {option.code && ' — '}
            {option.label}
            {option.source === 'clinica' && (
              <span className="ml-2 text-accent-ink text-xs">da clínica</span>
            )}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Campos PES conforme o tipo: risco sem evidência, promoção sem etiologia, síndrome com etiologia opcional. */
function PesInputs({
  type,
  relatedFactors,
  definingCharacteristics,
  onRelatedFactors,
  onDefiningCharacteristics,
}: {
  type: DiagnosisTypeOption;
  relatedFactors: string;
  definingCharacteristics: string;
  onRelatedFactors: (value: string) => void;
  onDefiningCharacteristics: (value: string) => void;
}) {
  const placeholders: Record<DiagnosisTypeOption, string> = {
    real: 'Sinais e sintomas observados',
    risco: '',
    'promocao-saude': 'Motivação/desejo expresso pelo paciente',
    sindrome: 'Diagnósticos que formam a síndrome',
  };
  return (
    <>
      {type !== 'promocao-saude' && (
        <label className="font-medium text-sm">
          {type === 'sindrome'
            ? 'Relacionado a (etiologia, opcional)'
            : 'Relacionado a (etiologia)'}
          <Input
            value={relatedFactors}
            onChange={(e) => onRelatedFactors(e.target.value)}
            placeholder="Fator relacionado / de risco"
            className="mt-1"
          />
        </label>
      )}
      {type !== 'risco' && (
        <label className="font-medium text-sm">
          Evidenciado por (características definidoras)
          <Input
            value={definingCharacteristics}
            onChange={(e) => onDefiningCharacteristics(e.target.value)}
            placeholder={placeholders[type]}
            className="mt-1"
          />
        </label>
      )}
    </>
  );
}

function DiagnosisTypeRadios({
  type,
  onChange,
}: {
  type: DiagnosisTypeOption;
  onChange: (type: DiagnosisTypeOption) => void;
}) {
  return (
    <RadioGroup
      legend="Tipo de diagnóstico"
      legendHidden
      name="diagnosis-type"
      orientation="horizontal"
    >
      {DIAGNOSIS_TYPE_OPTIONS.map((option) => (
        <RadioGroupItem
          key={option}
          value={option}
          checked={type === option}
          onChange={() => onChange(option)}
        >
          {CARE_PLAN_DIAGNOSIS_TYPE_LABELS[option]}
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
}

/** O que vai para a ação: item da clínica, código global ou título digitado ("sem código"). */
function diagnosisSource(
  selected: DiagnosisOption | null,
  freeText: string | null,
) {
  if (freeText !== null) return { diagnosisLabel: freeText.trim() };
  if (selected?.source === 'clinica') {
    return { clinicDiagnosisId: selected.id };
  }
  return { diagnosisCode: selected?.code };
}

export function AddDiagnosisForm({
  carePlanId,
  onSaved,
}: {
  carePlanId: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { term, setTerm, options } = useDiagnosisSearch();
  const [selected, setSelected] = useState<DiagnosisOption | null>(null);
  // `null` = busca no catálogo; texto = diagnóstico digitado à mão, sem código (#954).
  const [freeText, setFreeText] = useState<string | null>(null);
  const [type, setType] = useState<DiagnosisTypeOption>('real');
  const [relatedFactors, setRelatedFactors] = useState('');
  const [definingCharacteristics, setDefiningCharacteristics] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ready = selected !== null || freeText !== null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) {
      setError('Selecione um diagnóstico do catálogo');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        addCarePlanDiagnosis({
          id: carePlanId,
          body: {
            ...diagnosisSource(selected, freeText),
            type,
            relatedFactors: relatedFactors || null,
            definingCharacteristics: definingCharacteristics || null,
          },
        }),
      );
      toast({ description: 'Diagnóstico adicionado', variant: 'success' });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao prescrever diagnóstico',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      {freeText === null ? (
        <>
          <label className="font-medium text-sm">
            Buscar diagnóstico (NANDA-I)
            <Input
              value={selected ? optionText(selected) : term}
              onChange={(e) => {
                setSelected(null);
                setTerm(e.target.value);
              }}
              placeholder="Ex.: integridade da pele, 00046…"
              className="mt-1"
            />
          </label>
          {!selected && (
            <DiagnosisOptionList options={options} onSelect={setSelected} />
          )}
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setSelected(null);
              setFreeText(term);
            }}
            className="h-auto self-start p-0 text-accent-ink"
          >
            Não achei: escrever o diagnóstico
          </Button>
        </>
      ) : (
        <label className="font-medium text-sm">
          Diagnóstico (sem código)
          <Input
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            required
            minLength={3}
            maxLength={200}
            placeholder="Escreva o diagnóstico como a clínica usa"
            className="mt-1"
          />
        </label>
      )}
      {ready && (
        <>
          <DiagnosisTypeRadios type={type} onChange={setType} />
          <PesInputs
            type={type}
            relatedFactors={relatedFactors}
            definingCharacteristics={definingCharacteristics}
            onRelatedFactors={setRelatedFactors}
            onDefiningCharacteristics={setDefiningCharacteristics}
          />
        </>
      )}
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Salvando…' : 'Prescrever diagnóstico'}
      </Button>
    </SafeForm>
  );
}

function PrescribeOutcomeForm({
  carePlanId,
  diagnosisCode,
  onSaved,
}: {
  carePlanId: string;
  diagnosisCode: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data: linked } = useApiQuery<{ outcomes: NursingOutcomeDto[] }>(
    diagnosisCode
      ? `/api/taxonomy/diagnoses/${diagnosisCode}/linked-terms`
      : null,
  );
  const { term, setTerm, results } =
    useTaxonomySearch<NursingOutcomeDto>('outcomes');
  const [selected, setSelected] = useState<NursingOutcomeDto | null>(null);
  const [baselineScore, setBaselineScore] = useState('1');
  const [targetScore, setTargetScore] = useState('3');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggested = linked?.outcomes ?? [];
  const options = pickOptions(term, results, suggested);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError('Selecione um resultado do catálogo');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        prescribeCarePlanOutcome({
          id: carePlanId,
          body: {
            outcomeCode: selected.code,
            baselineScore: Number(baselineScore),
            targetScore: Number(targetScore),
          },
        }),
      );
      toast({ description: 'Resultado prescrito', variant: 'success' });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao prescrever resultado',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Buscar resultado (NOC)
        <Input
          value={searchInputValue(selected, term)}
          onChange={(e) => {
            setSelected(null);
            setTerm(e.target.value);
          }}
          placeholder="Ex.: integridade tissular, 1101…"
          className="mt-1"
        />
      </label>
      {!selected && (
        <TaxonomyOptionList
          options={options}
          linkedHint={term.trim().length < 2 ? '(ligado ao diagnóstico)' : null}
          onSelect={setSelected}
        />
      )}
      {selected && (
        <div className="grid grid-cols-2 gap-3">
          <label className="font-medium text-sm">
            Pontuação basal (1–5)
            <Input
              type="number"
              required
              min={1}
              max={5}
              step={1}
              value={baselineScore}
              onChange={(e) => setBaselineScore(e.target.value)}
              className="mt-1"
            />
            <span className="mt-1 block text-ink-3 text-xs">
              {selected.scaleAnchors[Number(baselineScore) - 1]}
            </span>
          </label>
          <label className="font-medium text-sm">
            Meta (1–5)
            <Input
              type="number"
              required
              min={1}
              max={5}
              step={1}
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
              className="mt-1"
            />
            <span className="mt-1 block text-ink-3 text-xs">
              {selected.scaleAnchors[Number(targetScore) - 1]}
            </span>
          </label>
        </div>
      )}
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Salvando…' : 'Prescrever resultado'}
      </Button>
    </SafeForm>
  );
}

function PrescribeInterventionForm({
  carePlanId,
  diagnosisCode,
  onSaved,
}: {
  carePlanId: string;
  diagnosisCode: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data: linked } = useApiQuery<{
    interventions: NursingInterventionDto[];
  }>(
    diagnosisCode
      ? `/api/taxonomy/diagnoses/${diagnosisCode}/linked-terms`
      : null,
  );
  const { term, setTerm, results } =
    useTaxonomySearch<NursingInterventionDto>('interventions');
  const [selected, setSelected] = useState<NursingInterventionDto | null>(null);
  const [frequency, setFrequency] = useState('');
  const [priority, setPriority] = useState<'baixa' | 'media' | 'alta'>('media');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggested = linked?.interventions ?? [];
  const options = pickOptions(term, results, suggested);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError('Selecione uma intervenção do catálogo');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        prescribeCarePlanIntervention({
          id: carePlanId,
          body: { interventionCode: selected.code, frequency, priority },
        }),
      );
      toast({ description: 'Intervenção prescrita', variant: 'success' });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao prescrever intervenção',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Buscar intervenção (NIC)
        <Input
          value={searchInputValue(selected, term)}
          onChange={(e) => {
            setSelected(null);
            setTerm(e.target.value);
          }}
          placeholder="Ex.: cuidados com lesões, 3660…"
          className="mt-1"
        />
      </label>
      {!selected && (
        <TaxonomyOptionList
          options={options}
          linkedHint={term.trim().length < 2 ? '(ligada ao diagnóstico)' : null}
          onSelect={setSelected}
        />
      )}
      {selected && (
        <>
          <label className="font-medium text-sm">
            Frequência *
            <Input
              required
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="Ex.: a cada troca de placa"
              className="mt-1"
            />
          </label>
          <RadioGroup
            legend="Prioridade da intervenção"
            legendHidden
            name="intervention-priority"
            orientation="horizontal"
          >
            {(['baixa', 'media', 'alta'] as const).map((option) => (
              <RadioGroupItem
                key={option}
                value={option}
                checked={priority === option}
                onChange={() => setPriority(option)}
              >
                {INTERVENTION_PRIORITY_LABELS[option]}
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </>
      )}
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Salvando…' : 'Prescrever intervenção'}
      </Button>
    </SafeForm>
  );
}

function EvaluateOutcomeForm({
  outcome,
  onSaved,
}: {
  outcome: CarePlanOutcomeDto;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [score, setScore] = useState(
    outcome.currentScore ?? outcome.baselineScore,
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        evaluateCarePlanOutcome({
          id: outcome.id,
          body: { score, notes: notes || null },
        }),
      );
      toast({
        description: 'Avaliação de resultado registrada',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao registrar avaliação',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <RadioGroup legend="Pontuação atual" name="outcome-score">
        {outcome.scaleAnchors.map((anchor, index) => {
          const value = index + 1;
          return (
            <RadioGroupItem
              key={value}
              value={value}
              checked={score === value}
              onChange={() => setScore(value)}
            >
              <span className="font-medium">{value}</span> — {anchor}
            </RadioGroupItem>
          );
        })}
      </RadioGroup>
      <label className="font-medium text-sm">
        Observações
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1"
        />
      </label>
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Salvando…' : 'Registrar avaliação'}
      </Button>
    </SafeForm>
  );
}
