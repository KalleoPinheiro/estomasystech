import { ValidationError } from '../shared/errors';
import { toTimeInput } from './time-of-day';

/** Intervalo sem atendimento dentro do dia (almoço), em minutos desde 00:00. */
export interface LunchBreak {
  startMinute: number;
  endMinute: number;
}

/**
 * Política de cancelamento da clínica: antecedência mínima para o paciente
 * mudar a consulta sozinho (portal) e, dentro dela, taxa opcional cobrada por
 * cancelamento tardio pedido pelo paciente ou por falta.
 */
export interface CancellationPolicy {
  noticeHours: number;
  /** 0 = sem taxa. */
  lateFeeCents: number;
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  noticeHours: 24,
  lateFeeCents: 0,
};

const MAX_NOTICE_HOURS = 168;
const MAX_LATE_FEE_CENTS = 1_000_000;

/** Dias da semana mesma convenção de `weekday` do fuso: 0=domingo … 6=sábado. */
export interface ScheduleConfig {
  weekdays: number[];
  startHour: number;
  endHour: number;
  minGapMinutes: number;
  /** Almoço da clínica — vale para todos os profissionais. Ausente = sem pausa. */
  lunchBreak?: LunchBreak | null;
  /** Ausente = `DEFAULT_CANCELLATION_POLICY` (24 h, sem taxa). */
  cancellationPolicy?: CancellationPolicy;
}

/** Comportamento histórico do sistema — usado quando nada foi configurado. */
export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
  minGapMinutes: 15,
  lunchBreak: null,
  cancellationPolicy: DEFAULT_CANCELLATION_POLICY,
};

const WEEKDAY_LABELS = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

// Piso imposto pela constraint de exclusão do banco (migração 0002): 15 minutos.
const MIN_GAP_FLOOR = 15;
const MAX_GAP = 120;

const isIntInRange = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

export function validateScheduleConfig(config: ScheduleConfig): ScheduleConfig {
  const weekdays = [...new Set(config.weekdays)].sort((a, b) => a - b);
  if (weekdays.length === 0 || !weekdays.every((d) => isIntInRange(d, 0, 6))) {
    throw new ValidationError('Selecione ao menos um dia da semana válido');
  }
  const hoursValid =
    isIntInRange(config.startHour, 0, 23) &&
    isIntInRange(config.endHour, 1, 24) &&
    config.startHour < config.endHour;
  if (!hoursValid) {
    throw new ValidationError(
      'Horário de funcionamento inválido (abertura antes do fechamento, 0–24h)',
    );
  }
  if (!isIntInRange(config.minGapMinutes, MIN_GAP_FLOOR, MAX_GAP)) {
    throw new ValidationError(
      `Intervalo entre consultas deve ser de ${MIN_GAP_FLOOR} a ${MAX_GAP} minutos`,
    );
  }
  return {
    ...config,
    weekdays,
    lunchBreak: validateLunchBreak(config.lunchBreak ?? null, config),
    cancellationPolicy: validateCancellationPolicy(
      config.cancellationPolicy ?? DEFAULT_CANCELLATION_POLICY,
    ),
  };
}

export function validateCancellationPolicy(
  policy: CancellationPolicy,
): CancellationPolicy {
  if (!isIntInRange(policy.noticeHours, 0, MAX_NOTICE_HOURS)) {
    throw new ValidationError(
      `Antecedência para cancelar deve ser de 0 a ${MAX_NOTICE_HOURS} horas`,
    );
  }
  if (!isIntInRange(policy.lateFeeCents, 0, MAX_LATE_FEE_CENTS)) {
    throw new ValidationError('Taxa de cancelamento tardio inválida');
  }
  return { noticeHours: policy.noticeHours, lateFeeCents: policy.lateFeeCents };
}

export function cancellationPolicyOf(
  config: ScheduleConfig | null | undefined,
): CancellationPolicy {
  return config?.cancellationPolicy ?? DEFAULT_CANCELLATION_POLICY;
}

/** Mudança dentro da antecedência mínima (inclusive depois do início). */
export function isLateChange(
  startsAt: Date,
  at: Date,
  policy: CancellationPolicy,
): boolean {
  return at.getTime() > startsAt.getTime() - policy.noticeHours * 3_600_000;
}

function validateLunchBreak(
  lunch: LunchBreak | null,
  config: ScheduleConfig,
): LunchBreak | null {
  if (lunch === null) {
    return null;
  }
  const valid =
    Number.isInteger(lunch.startMinute) &&
    Number.isInteger(lunch.endMinute) &&
    lunch.startMinute < lunch.endMinute &&
    lunch.startMinute > config.startHour * 60 &&
    lunch.endMinute < config.endHour * 60;
  if (!valid) {
    throw new ValidationError(
      'Intervalo de almoço deve começar antes de terminar e ficar dentro do horário de funcionamento',
    );
  }
  return { startMinute: lunch.startMinute, endMinute: lunch.endMinute };
}

/** 750 → "12:30". */
export const formatMinuteOfDay = toTimeInput;

export function describeSchedule(config: ScheduleConfig): string {
  const days = config.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ');
  const hours = `${days}, das ${String(config.startHour).padStart(2, '0')}:00 às ${config.endHour}:00`;
  const lunch = config.lunchBreak;
  return lunch
    ? `${hours} (pausa das ${formatMinuteOfDay(lunch.startMinute)} às ${formatMinuteOfDay(lunch.endMinute)})`
    : hours;
}

export interface ScheduleConfigRepository {
  get(): Promise<ScheduleConfig | null>;
  save(config: ScheduleConfig): Promise<void>;
}
