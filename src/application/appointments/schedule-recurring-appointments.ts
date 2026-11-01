import type { Appointment } from '@/domain/scheduling/appointment';
import { ValidationError } from '@/domain/shared/errors';
import type {
  ScheduleAppointment,
  ScheduleAppointmentInput,
} from './schedule-appointment';

const MS_PER_WEEK = 7 * 86_400_000;
const MAX_OCCURRENCES = 24;

export interface RecurringScheduleInput extends ScheduleAppointmentInput {
  /** Total de ocorrências, incluindo a primeira (2–24). */
  occurrences: number;
  /** Repetir a cada N semanas (default 1). */
  weeksInterval?: number;
}

export interface RecurringScheduleResult {
  created: Appointment[];
  skipped: Array<{ startsAt: Date; reason: string }>;
}

/**
 * Série recorrente semanal (O3.2): cada ocorrência valida individualmente;
 * conflito ou grade fechada pula a ocorrência sem abortar as demais.
 */
const isIntInRange = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

function validateRecurrence(input: RecurringScheduleInput): number {
  if (!isIntInRange(input.occurrences, 2, MAX_OCCURRENCES)) {
    throw new ValidationError(
      `Série deve ter de 2 a ${MAX_OCCURRENCES} ocorrências`,
    );
  }
  const interval = input.weeksInterval ?? 1;
  if (!isIntInRange(interval, 1, 8)) {
    throw new ValidationError('Intervalo deve ser de 1 a 8 semanas');
  }
  return interval;
}

export class ScheduleRecurringAppointments {
  constructor(private readonly schedule: ScheduleAppointment) {}

  async execute(
    input: RecurringScheduleInput,
  ): Promise<RecurringScheduleResult> {
    const interval = validateRecurrence(input);
    // Paciente alheio ou inexistente invalida a série toda (#605).
    await this.schedule.assertPatient(input.patientId);
    // Profissional inválido invalida a série toda — não vira N ocorrências puladas.
    await this.schedule.assertProfessional(input.professionalId);
    const result: RecurringScheduleResult = { created: [], skipped: [] };
    for (let occurrence = 0; occurrence < input.occurrences; occurrence += 1) {
      const offset = occurrence * interval * MS_PER_WEEK;
      const startsAt = new Date(input.startsAt.getTime() + offset);
      const endsAt = new Date(input.endsAt.getTime() + offset);
      try {
        result.created.push(
          await this.schedule.execute({ ...input, startsAt, endsAt }),
        );
      } catch (error) {
        result.skipped.push({
          startsAt,
          reason: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }
    return result;
  }
}
