import type { CarePlanStatus } from '@/domain/clinical/care-plan';
import type { CarePlanDiagnosisType } from '@/domain/clinical/care-plan-diagnosis';
import type { InterventionPriority } from '@/domain/clinical/care-plan-intervention';
import { appTimeZone } from '@/domain/shared/time-zone';
import type { CarePlanDiagnosisDto } from '@/lib/dto';

export const formatCurrency = (cents: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100,
  );

/** Fração (0.153) → "15,3%" — vírgula decimal pt-BR (REL-03). */
export const formatPercent = (fraction: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
  }).format(fraction);

/**
 * Data e hora no fuso da clínica (`APP_TIMEZONE`) com locale fixo: servidor e
 * navegador devolvem o mesmo texto, em qualquer fuso do aparelho (#543).
 */
export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: appTimeZone() });

/**
 * Data civil (nascimento, só dia): sem hora nem fuso, nunca desloca de dia
 * (ADR-073). Vale o dia `AAAA-MM-DD` do valor, que é gravado à meia-noite UTC;
 * `formatDate` o mostraria um dia antes em São Paulo.
 */
export const formatCivilDate = (value: string): string => {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: appTimeZone(),
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatDateTime = (iso: string): string =>
  `${formatDate(iso)} ${formatTime(iso)}`;

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  no_show: 'Faltou',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Paga',
  cancelled: 'Cancelada',
};

export const STOMA_TYPE_LABELS: Record<string, string> = {
  colostomia: 'Colostomia',
  ileostomia: 'Ileostomia',
  urostomia: 'Urostomia',
};

export const CONDITION_KIND_LABELS: Record<string, string> = {
  stoma: 'Estomia',
  wound: 'Ferida',
};

export const EXUDATE_LABELS: Record<string, string> = {
  none: 'Nenhum',
  low: 'Baixo',
  moderate: 'Moderado',
  high: 'Alto',
};

/** Tecido predominante (PUSH 3.0). Texto livre legado não está aqui: mostra-se como foi gravado. */
export const TISSUE_TYPE_LABELS: Record<string, string> = {
  closed: 'Fechado',
  epithelial: 'Epitelização',
  granulation: 'Granulação',
  slough: 'Esfacelo',
  necrotic: 'Necrose',
};

/** Rótulo do tecido; código desconhecido (texto livre legado) aparece como foi gravado. */
export function tissueTypeLabel(code: string): string {
  return TISSUE_TYPE_LABELS[code] ?? code;
}

export const INFECTION_LEVEL_LABELS: Record<string, string> = {
  none: 'Sem sinais de infecção',
  inflammation: 'Inflamação',
  local: 'Infecção local',
  spreading: 'Infecção com disseminação',
  systemic: 'Infecção sistêmica',
};

export const INFECTION_SIGN_LABELS: Record<string, string> = {
  erythema: 'Eritema',
  heat: 'Calor local',
  edema: 'Edema',
  increased_exudate: 'Aumento do exsudato',
  purulent_exudate: 'Exsudato purulento',
  malodor: 'Odor fétido',
  local_pain: 'Dor local nova ou aumentada',
  friable_granulation: 'Granulação friável',
  delayed_healing: 'Cicatrização estagnada',
  biofilm_suspected: 'Suspeita de biofilme',
  spreading_erythema: 'Eritema em expansão',
  lymphangitis: 'Linfangite',
  lymphadenopathy: 'Linfadenopatia',
  fever: 'Febre',
  malaise: 'Mal-estar',
};

export const WOUND_EDGE_LABELS: Record<string, string> = {
  attached: 'Aderidas',
  detached: 'Descoladas',
  rolled: 'Epíbole (enroladas)',
  macerated: 'Maceradas',
  undermined: 'Solapadas',
  hyperkeratotic: 'Hiperqueratósicas',
  epithelializing: 'Em epitelização',
};

export const EXUDATE_TYPE_LABELS: Record<string, string> = {
  serous: 'Seroso',
  serosanguineous: 'Serossanguinolento',
  sanguineous: 'Sanguinolento',
  purulent: 'Purulento',
};

export const FOLLOW_UP_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  done: 'Concluído',
  cancelled: 'Cancelado',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  insurance: 'Convênio',
  transfer: 'Transferência',
};

export const CARE_PLAN_STATUS_LABELS: Record<CarePlanStatus, string> = {
  active: 'Ativo',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
};

export const CARE_PLAN_DIAGNOSIS_TYPE_LABELS: Record<
  CarePlanDiagnosisType,
  string
> = {
  real: 'Real',
  risco: 'Risco',
  'promocao-saude': 'Promoção da saúde',
};

export const INTERVENTION_PRIORITY_LABELS: Record<
  InterventionPriority,
  string
> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

/** Frase PES legível: Problema relacionado a Etiologia, evidenciado por Sinais/sintomas. */
export function pesSentence(diagnosis: CarePlanDiagnosisDto): string {
  if (diagnosis.type === 'risco') {
    return `Risco de ${diagnosis.diagnosisLabel} relacionado a ${diagnosis.relatedFactors}`;
  }
  if (diagnosis.type === 'promocao-saude') {
    return `${diagnosis.diagnosisLabel} evidenciado por ${diagnosis.definingCharacteristics}`;
  }
  return `${diagnosis.diagnosisLabel} relacionado a ${diagnosis.relatedFactors}, evidenciado por ${diagnosis.definingCharacteristics}`;
}

/** Rótulo de progresso de um resultado NOC — usa `attainment` para distinguir regressão de progresso. */
export function outcomeStatusLabel(outcome: {
  isAchieved: boolean | null;
  attainment: number | null;
}): string {
  if (outcome.isAchieved == null) {
    return 'Sem avaliação';
  }
  if (outcome.isAchieved) {
    return 'Meta atingida';
  }
  return (outcome.attainment ?? 0) < 0 ? 'Em regressão' : 'Em progresso';
}

/** Regra de repasse legível: "40% da sessão" ou "R$ 50,00 por sessão". */
export const formatCommissionRule = (
  rule:
    | { kind: 'percentage'; pct: number }
    | { kind: 'fixed'; centsPerSession: number }
    | null,
): string => {
  if (!rule) return '—';
  return rule.kind === 'fixed'
    ? `${formatCurrency(rule.centsPerSession)} por sessão`
    : `${rule.pct}% da sessão`;
};

/** "2026-08" → "Agosto de 2026" (REL-02) — só a 1ª letra maiúscula, mesma
 * correção de capitalização já usada em `/agenda`. */
export function monthLabelPtBr(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  const raw = new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleDateString(
    'pt-BR',
    {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    },
  );
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}
