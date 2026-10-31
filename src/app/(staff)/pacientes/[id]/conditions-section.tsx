'use client';

import {
  Button,
  Card,
  Input,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { FormSheet } from '@/components/form-sheet';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import { unwrapAction } from '@/lib/action-result';
import { apiFetch } from '@/lib/client';
import type { AssessmentDto, ConditionDto } from '@/lib/dto';
import {
  CONDITION_KIND_LABELS,
  EXUDATE_LABELS,
  EXUDATE_TYPE_LABELS,
  formatDate,
  formatDateTime,
  STOMA_TYPE_LABELS,
  tissueTypeLabel,
} from '@/lib/format';
import type {
  AssessmentBody,
  ConditionBody,
} from '@/lib/patient-record-schemas';
import { timeSummary, tissueProfile } from '@/lib/wound-time-summary';
import {
  addConditionAssessment,
  createCondition,
  resolveCondition as resolveConditionAction,
} from './actions/prontuario';
import {
  EMPTY_TIME_VALUES,
  TimeFields,
  type TimeFormValues,
  toTimePayload,
} from './assessment-time-fields';
import { ConditionPhotos } from './condition-photos';

// O gráfico só aparece com a condição aberta e traz a lib de gráficos: fora do JS da carga.
// O reservado tem a altura do gráfico, então abrir a condição não desloca a tabela.
const HealingChart = dynamic(
  () => import('@/components/healing-chart').then((m) => m.HealingChart),
  { loading: () => <div className="h-[200px]" aria-hidden="true" /> },
);

interface ConditionsSectionProps {
  patientId: string;
  conditions: ConditionDto[];
  error: string | null;
  isLoading: boolean;
  onChanged: () => void;
  onRetry: () => void;
}

export function ConditionsSection({
  patientId,
  conditions,
  error,
  isLoading,
  onChanged,
  onRetry,
}: ConditionsSectionProps) {
  const { toast } = useToast();
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [assessing, setAssessing] = useState<ConditionDto | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<
    Record<string, AssessmentDto[]>
  >({});

  const loadAssessments = useCallback(async (conditionId: string) => {
    const result = await apiFetch<AssessmentDto[]>(
      `/api/conditions/${conditionId}/assessments`,
    );
    setAssessments((prev) => ({ ...prev, [conditionId]: result }));
  }, []);

  const toggleExpanded = (conditionId: string) => {
    const willOpen = expanded !== conditionId;
    setExpanded(willOpen ? conditionId : null);
    if (willOpen) {
      void loadAssessments(conditionId).catch(() => undefined);
    }
  };

  const resolveCondition = async (condition: ConditionDto) => {
    try {
      await unwrapAction(resolveConditionAction({ id: condition.id }));
      toast({ description: 'Condição resolvida', variant: 'success' });
      onChanged();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao resolver condição',
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {actionError && <ErrorAlert message={actionError} />}
      <div className="flex items-center justify-between">
        <p className="text-ink-3 text-sm">
          Estomias e feridas com avaliações seriadas para acompanhar a evolução.
        </p>
        <Button
          type="button"
          onClick={() => setCreating(true)}
          variant="accent"
        >
          + Nova condição
        </Button>
      </div>

      {isLoading ? (
        <LoadingIndicator />
      ) : error ? (
        <ErrorAlert message={error} onRetry={onRetry} />
      ) : conditions.length === 0 ? (
        <EmptyState message="Nenhuma condição clínica cadastrada." />
      ) : (
        <ul className="flex flex-col gap-3">
          {conditions.map((condition) => {
            const conditionAssessments = assessments[condition.id] ?? [];
            const isOpen = expanded === condition.id;
            return (
              <Card as="li" key={condition.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="mr-2 font-medium">{condition.title}</span>
                    <span className="mr-2 text-ink-3 text-xs">
                      {CONDITION_KIND_LABELS[condition.kind]}
                      {condition.stomaType
                        ? ` · ${STOMA_TYPE_LABELS[condition.stomaType]}`
                        : ''}
                      {condition.startedAt
                        ? ` · desde ${formatDate(condition.startedAt)}`
                        : ''}
                    </span>
                    <StatusBadge
                      status={
                        condition.status === 'active'
                          ? 'confirmed'
                          : 'completed'
                      }
                      label={
                        condition.status === 'active'
                          ? 'Em acompanhamento'
                          : 'Resolvida'
                      }
                    />
                  </div>
                  <div className="flex gap-2 text-sm">
                    <Button
                      type="button"
                      onClick={() => toggleExpanded(condition.id)}
                      variant="link"
                      className="h-auto p-0 text-accent-ink"
                    >
                      {isOpen ? 'Ocultar avaliações' : 'Ver avaliações'}
                    </Button>
                    {condition.status === 'active' && (
                      <>
                        <Button
                          type="button"
                          onClick={() => setAssessing(condition)}
                          variant="link"
                          className="h-auto p-0 text-accent-ink"
                        >
                          + Avaliação
                        </Button>
                        <ConfirmAction
                          trigger={
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 text-ink-3"
                            >
                              Marcar resolvida
                            </Button>
                          }
                          title="Resolver esta condição clínica?"
                          description="A condição é travada permanentemente. Não existe ação de reabrir depois."
                          confirmLabel="Confirmar"
                          variant="danger"
                          onConfirm={() => resolveCondition(condition)}
                        />
                      </>
                    )}
                    <a
                      href={`/documentos/relatorio/${condition.id}`}
                      className="font-medium text-accent-ink hover:underline"
                    >
                      Relatório p/ parceiro
                    </a>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 border-border border-t pt-3">
                    <ConditionPhotos
                      conditionId={condition.id}
                      canUpload={condition.status === 'active'}
                    />
                    {conditionAssessments.length === 0 ? (
                      <EmptyState message="Nenhuma avaliação registrada." />
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="mb-3">
                          <HealingChart assessments={conditionAssessments} />
                        </div>
                        <Table stack className="text-left text-xs">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="py-1 pr-3">Data</TableHead>
                              <TableHead className="py-1 pr-3">
                                C×L×P (mm)
                              </TableHead>
                              <TableHead className="py-1 pr-3">
                                Área (mm²)
                              </TableHead>
                              <TableHead className="py-1 pr-3">
                                Tecido
                              </TableHead>
                              <TableHead className="py-1 pr-3">
                                Exsudato
                              </TableHead>
                              <TableHead className="py-1 pr-3">
                                Infecção / Bordas
                              </TableHead>
                              <TableHead className="py-1 pr-3">Dor</TableHead>
                              <TableHead className="py-1 pr-3">
                                PUSH/DET
                              </TableHead>
                              <TableHead className="py-1 pr-3">
                                Pele periestomal
                              </TableHead>
                              <TableHead className="py-1">
                                Complicações
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {conditionAssessments.map((a) => (
                              <TableRow key={a.id}>
                                <TableCell label="Data" className="py-1.5 pr-3">
                                  {formatDateTime(a.createdAt)}
                                </TableCell>
                                <TableCell
                                  label="C×L×P (mm)"
                                  className="py-1.5 pr-3"
                                >
                                  {a.lengthMm != null
                                    ? `${a.lengthMm}×${a.widthMm ?? '—'}×${a.depthMm ?? '—'}`
                                    : '—'}
                                </TableCell>
                                <TableCell
                                  label="Área (mm²)"
                                  className="py-1.5 pr-3"
                                >
                                  {a.areaMm2 ?? '—'}
                                </TableCell>
                                <TableCell
                                  label="Tecido"
                                  className="py-1.5 pr-3"
                                >
                                  {a.tissueType
                                    ? tissueTypeLabel(a.tissueType)
                                    : '—'}
                                  {tissueProfile(a) && (
                                    <span className="block text-ink-3">
                                      {tissueProfile(a)}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell
                                  label="Exsudato"
                                  className="py-1.5 pr-3"
                                >
                                  {a.exudate ? EXUDATE_LABELS[a.exudate] : '—'}
                                  {a.exudateType && (
                                    <span className="block text-ink-3">
                                      {EXUDATE_TYPE_LABELS[a.exudateType] ??
                                        a.exudateType}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell
                                  label="Infecção / Bordas"
                                  className={infectionCellClass(a)}
                                >
                                  {timeSummary(a)}
                                </TableCell>
                                <TableCell
                                  label="Dor"
                                  className={painCellClass(a.painScale)}
                                >
                                  {a.painScale != null
                                    ? `${a.painScale}/10`
                                    : '—'}
                                </TableCell>
                                <TableCell
                                  label="PUSH/DET"
                                  className="py-1.5 pr-3 font-medium"
                                >
                                  {scoreLabel(a)}
                                </TableCell>
                                <TableCell
                                  label="Pele periestomal"
                                  className="py-1.5 pr-3"
                                >
                                  {a.skinCondition ?? '—'}
                                </TableCell>
                                <TableCell
                                  label="Complicações"
                                  className={complicationsCellClass(a)}
                                >
                                  {complicationsCellText(a)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </ul>
      )}

      {creating && (
        <Modal title="Nova condição clínica" onClose={() => setCreating(false)}>
          <ConditionForm
            patientId={patientId}
            onSaved={() => {
              setCreating(false);
              onChanged();
            }}
          />
        </Modal>
      )}

      {assessing && (
        <AssessmentSheet
          condition={assessing}
          onClose={() => setAssessing(null)}
          onSaved={() => {
            void loadAssessments(assessing.id).catch(() => undefined);
            setExpanded(assessing.id);
            setAssessing(null);
          }}
        />
      )}
    </div>
  );
}

function ConditionForm({
  patientId,
  onSaved,
}: {
  patientId: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [kind, setKind] = useState<'stoma' | 'wound'>('stoma');
  const [title, setTitle] = useState('');
  const [stomaType, setStomaType] = useState('colostomia');
  const [startedAt, setStartedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        createCondition({
          patientId,
          body: {
            kind,
            title,
            // O estado do formulário é texto livre; o `zod` do servidor valida.
            stomaType: (kind === 'stoma'
              ? stomaType
              : null) as ConditionBody['stomaType'],
            startedAt: startedAt ? new Date(startedAt).toISOString() : null,
            notes: notes || null,
          },
        }),
      );
      toast({ description: 'Condição registrada', variant: 'success' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar condição');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Tipo *
        <NativeSelect
          value={kind}
          onChange={(e) => setKind(e.target.value as 'stoma' | 'wound')}
          className="mt-1"
        >
          <option value="stoma">Estomia</option>
          <option value="wound">Ferida</option>
        </NativeSelect>
      </label>
      {kind === 'stoma' && (
        <label className="font-medium text-sm">
          Tipo de estomia *
          <NativeSelect
            value={stomaType}
            onChange={(e) => setStomaType(e.target.value)}
            className="mt-1"
          >
            {Object.entries(STOMA_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <label className="font-medium text-sm">
        Descrição/localização *
        <Input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            kind === 'stoma'
              ? 'Ex.: Colostomia terminal QIE'
              : 'Ex.: Úlcera venosa perna E'
          }
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Início (cirurgia/lesão)
        <Input
          type="date"
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
          className="mt-1"
        />
      </label>
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
        {saving ? 'Salvando…' : 'Criar condição'}
      </Button>
    </form>
  );
}

const HIGH_PAIN_THRESHOLD = 7;
const ABNORMAL_CELL_CLASS = 'font-semibold text-danger';

/** Dor alta ganha destaque visual (PRONT-05) — mesmo peso de "área 4mm²" hoje. */
function painCellClass(painScale: number | null): string {
  const abnormal = painScale != null && painScale >= HIGH_PAIN_THRESHOLD;
  return `py-1.5 pr-3 ${abnormal ? ABNORMAL_CELL_CLASS : ''}`;
}

/** Infecção local ou pior ganha destaque, como a dor alta. */
function infectionCellClass(assessment: AssessmentDto): string {
  const abnormal =
    assessment.infectionLevel != null &&
    ['local', 'spreading', 'systemic'].includes(assessment.infectionLevel);
  return `py-1.5 pr-3 ${abnormal ? ABNORMAL_CELL_CLASS : ''}`;
}

function complicationsCellClass(assessment: AssessmentDto): string {
  const abnormal = complicationsCellText(assessment) !== '—';
  return `py-1.5 ${abnormal ? ABNORMAL_CELL_CLASS : ''}`;
}

/** Score clínico validado da avaliação: PUSH (ferida) ou DET (estomia). */
function scoreLabel(assessment: AssessmentDto): string {
  if (assessment.pushScore != null) return `PUSH ${assessment.pushScore}`;
  if (assessment.detScore != null) return `DET ${assessment.detScore}`;
  return '—';
}

interface AssessmentFormValues extends TimeFormValues {
  lengthMm: string;
  widthMm: string;
  depthMm: string;
  tissueType: string;
  exudate: string;
  painScale: string;
  skinCondition: string;
  complications: string;
  complicationCodes: string[];
  detDiscolorationArea: string;
  detDiscolorationSeverity: string;
  detErosionArea: string;
  detErosionSeverity: string;
  detOvergrowthArea: string;
  detOvergrowthSeverity: string;
  notes: string;
}

/** Complicações canônicas de estomia (O2.2) — labels em pt-BR. */
const COMPLICATION_OPTIONS = [
  { value: 'dermatitis', label: 'Dermatite' },
  { value: 'prolapse', label: 'Prolapso' },
  { value: 'hernia', label: 'Hérnia' },
  { value: 'retraction', label: 'Retração' },
  { value: 'bleeding', label: 'Sangramento' },
  { value: 'granuloma', label: 'Granuloma' },
  { value: 'stenosis', label: 'Estenose' },
  { value: 'other', label: 'Outra' },
];

/** Labels canônicas + texto livre lado a lado (issue #67 — dado gravado, antes nunca exibido). */
function complicationsCellText(assessment: AssessmentDto): string {
  const labels = assessment.complicationCodes.map(
    (code) =>
      COMPLICATION_OPTIONS.find((option) => option.value === code)?.label ??
      code,
  );
  const parts = [...labels, assessment.complications].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join('; ') : '—';
}

const toNumberOrNull = (value: string): number | null =>
  value ? Number(value) : null;
const toTextOrNull = (value: string): string | null => value || null;

const toAssessmentPayload = (values: AssessmentFormValues) => ({
  lengthMm: toNumberOrNull(values.lengthMm),
  widthMm: toNumberOrNull(values.widthMm),
  depthMm: toNumberOrNull(values.depthMm),
  tissueType: toTextOrNull(values.tissueType),
  exudate: toTextOrNull(values.exudate),
  painScale: toNumberOrNull(values.painScale),
  skinCondition: toTextOrNull(values.skinCondition),
  complications: toTextOrNull(values.complications),
  complicationCodes:
    values.complicationCodes.length > 0
      ? values.complicationCodes.join(',')
      : null,
  detDiscolorationArea: toNumberOrNull(values.detDiscolorationArea),
  detDiscolorationSeverity: toNumberOrNull(values.detDiscolorationSeverity),
  detErosionArea: toNumberOrNull(values.detErosionArea),
  detErosionSeverity: toNumberOrNull(values.detErosionSeverity),
  detOvergrowthArea: toNumberOrNull(values.detOvergrowthArea),
  detOvergrowthSeverity: toNumberOrNull(values.detOvergrowthSeverity),
  ...toTimePayload(values),
  notes: toTextOrNull(values.notes),
});

const INITIAL_ASSESSMENT_VALUES: AssessmentFormValues = {
  lengthMm: '',
  widthMm: '',
  depthMm: '',
  tissueType: '',
  exudate: '',
  painScale: '',
  skinCondition: '',
  complications: '',
  complicationCodes: [],
  detDiscolorationArea: '',
  detDiscolorationSeverity: '',
  detErosionArea: '',
  detErosionSeverity: '',
  detOvergrowthArea: '',
  detOvergrowthSeverity: '',
  ...EMPTY_TIME_VALUES,
  notes: '',
};

/**
 * Janela da avaliação. O estado do formulário mora aqui, acima da troca
 * `Modal` ↔ folha de tela cheia: girar o celular atravessa o ponto de corte e
 * remonta a janela, e o que foi digitado não pode se perder (#523).
 */
function AssessmentSheet({
  condition,
  onClose,
  onSaved,
}: {
  condition: ConditionDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState(INITIAL_ASSESSMENT_VALUES);
  const dirty =
    JSON.stringify(values) !== JSON.stringify(INITIAL_ASSESSMENT_VALUES);
  return (
    <FormSheet
      title={`Avaliação — ${condition.title}`}
      onClose={onClose}
      dirty={dirty}
      discardTitle="Descartar avaliação?"
    >
      <AssessmentForm
        condition={condition}
        values={values}
        setValues={setValues}
        onSaved={onSaved}
      />
    </FormSheet>
  );
}

function AssessmentForm({
  condition,
  values,
  setValues,
  onSaved,
}: {
  condition: ConditionDto;
  values: AssessmentFormValues;
  setValues: React.Dispatch<React.SetStateAction<AssessmentFormValues>>;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isWound = condition.kind === 'wound';
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const setTime = (patch: Partial<TimeFormValues>) =>
    setValues((prev) => ({ ...prev, ...patch }));

  const toggleComplication = (code: string) =>
    setValues((prev) => ({
      ...prev,
      complicationCodes: prev.complicationCodes.includes(code)
        ? prev.complicationCodes.filter((c) => c !== code)
        : [...prev.complicationCodes, code],
    }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        addConditionAssessment({
          id: condition.id,
          body: toAssessmentPayload(values) as AssessmentBody,
        }),
      );
      toast({ description: 'Avaliação registrada', variant: 'success' });
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
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {error && <ErrorAlert message={error} />}
        {isWound && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="font-medium text-sm">
                Comprimento (mm)
                <Input
                  type="number"
                  min="0"
                  value={values.lengthMm}
                  onChange={(e) => set('lengthMm')(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="font-medium text-sm">
                Largura (mm)
                <Input
                  type="number"
                  min="0"
                  value={values.widthMm}
                  onChange={(e) => set('widthMm')(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="font-medium text-sm">
                Profundidade (mm)
                <Input
                  type="number"
                  min="0"
                  value={values.depthMm}
                  onChange={(e) => set('depthMm')(e.target.value)}
                  className="mt-1"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="font-medium text-sm">
                Tecido predominante
                <NativeSelect
                  value={values.tissueType}
                  onChange={(e) => set('tissueType')(e.target.value)}
                  className="mt-1"
                >
                  <option value="">—</option>
                  {/* Valores canônicos do PUSH 3.0 — texto livre legado permanece no histórico. */}
                  <option value="closed">Fechado (0)</option>
                  <option value="epithelial">Epitelização (1)</option>
                  <option value="granulation">Granulação (2)</option>
                  <option value="slough">Esfacelo (3)</option>
                  <option value="necrotic">Necrose (4)</option>
                </NativeSelect>
              </label>
              <label className="font-medium text-sm">
                Exsudato
                <NativeSelect
                  value={values.exudate}
                  onChange={(e) => set('exudate')(e.target.value)}
                  className="mt-1"
                >
                  <option value="">—</option>
                  {Object.entries(EXUDATE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>
            <TimeFields values={values} onChange={setTime} />
            <label className="font-medium text-sm">
              Pele perilesional
              <Input
                value={values.skinCondition}
                onChange={(e) => set('skinCondition')(e.target.value)}
                placeholder="Ex.: íntegra, macerada, eritema, descamação…"
                className="mt-1"
              />
            </label>
          </>
        )}
        {!isWound && (
          <>
            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 font-semibold text-ink-3 text-xs uppercase">
                Escala DET (0–15) — área 0–3 · severidade 0–2
              </legend>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <DetDomainInputs
                  label="Descoloração"
                  area={values.detDiscolorationArea}
                  severity={values.detDiscolorationSeverity}
                  onArea={set('detDiscolorationArea')}
                  onSeverity={set('detDiscolorationSeverity')}
                />
                <DetDomainInputs
                  label="Erosão"
                  area={values.detErosionArea}
                  severity={values.detErosionSeverity}
                  onArea={set('detErosionArea')}
                  onSeverity={set('detErosionSeverity')}
                />
                <DetDomainInputs
                  label="Hiperplasia"
                  area={values.detOvergrowthArea}
                  severity={values.detOvergrowthSeverity}
                  onArea={set('detOvergrowthArea')}
                  onSeverity={set('detOvergrowthSeverity')}
                />
              </div>
            </fieldset>
            <div>
              <p className="mb-1 font-medium text-sm">Complicações</p>
              <div className="flex flex-wrap gap-2">
                {COMPLICATION_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    onClick={() => toggleComplication(option.value)}
                    className={`rounded-full px-2.5 py-1 font-medium text-xs ${
                      values.complicationCodes.includes(option.value)
                        ? 'bg-danger text-white'
                        : 'border border-border-strong text-ink-2 hover:bg-surface-2'
                    }`}
                    variant="outline"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <label className="font-medium text-sm">
              Pele periestomal
              <Input
                value={values.skinCondition}
                onChange={(e) => set('skinCondition')(e.target.value)}
                placeholder="Ex.: íntegra, dermatite leve…"
                className="mt-1"
              />
            </label>
            <label className="font-medium text-sm">
              Observação de complicações (texto livre)
              <Input
                value={values.complications}
                onChange={(e) => set('complications')(e.target.value)}
                placeholder="Detalhe as complicações selecionadas…"
                className="mt-1"
              />
            </label>
          </>
        )}
        <label className="font-medium text-sm">
          Dor (0–10)
          <Input
            type="number"
            min="0"
            max="10"
            value={values.painScale}
            onChange={(e) => set('painScale')(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Observações
          <Textarea
            rows={2}
            value={values.notes}
            onChange={(e) => set('notes')(e.target.value)}
            className="mt-1"
          />
        </label>
      </div>
      {/* Rodapé fora da rolagem: no celular o botão fica sempre à vista (#523). */}
      <div className="border-border border-t pt-3">
        <Button
          type="submit"
          disabled={saving}
          variant="accent"
          className="w-full sm:w-auto"
        >
          {saving ? 'Registrando…' : 'Registrar avaliação'}
        </Button>
      </div>
    </form>
  );
}

function DetDomainInputs({
  label,
  area,
  severity,
  onArea,
  onSeverity,
}: {
  label: string;
  area: string;
  severity: string;
  onArea: (value: string) => void;
  onSeverity: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 font-medium">{label}</p>
      <div className="flex gap-2">
        <Input
          type="number"
          min="0"
          max="3"
          placeholder="área"
          value={area}
          onChange={(e) => onArea(e.target.value)}
        />
        <Input
          type="number"
          min="0"
          max="2"
          placeholder="sev."
          value={severity}
          onChange={(e) => onSeverity(e.target.value)}
        />
      </div>
    </div>
  );
}
