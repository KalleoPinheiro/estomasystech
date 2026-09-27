import { assertSlotAvailable } from '@/application/appointments/assert-slot-available';
import type { ProcedureRepository } from '@/domain/catalog/procedure-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import type { ScheduleAvailabilityRepository } from '@/domain/scheduling/schedule-availability';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfigRepository,
} from '@/domain/scheduling/schedule-config';
import {
  NotFoundError,
  SchedulingConflictError,
  ValidationError,
} from '@/domain/shared/errors';
import { TimeSlot } from '@/domain/shared/time-slot';
import { findOwnAppointment } from './own-appointment';

export type ListAvailableSlotsInput = {
  /** Email da sessão do paciente — escopo obrigatório. */
  /** Titular resolvido pelo vínculo da conta de portal (#196). */
  patientId: string;
  /** Dia local no formato AAAA-MM-DD. */
  date: string;
  now?: Date;
} & (
  | { procedureId: string; appointmentId?: undefined }
  /** Remarcação: duração e profissional vêm da própria consulta. */
  | { appointmentId: string; procedureId?: undefined }
);

/** O que define os candidatos: duração, profissional e consulta a ignorar. */
interface SlotRequest {
  durationMinutes: number;
  professionalId: string | null;
  excludeId?: string;
}

export interface AvailableSlot {
  startsAt: Date;
  endsAt: Date;
}

const MINUTE_MS = 60_000;

/**
 * Horários livres de um dia para o paciente agendar seu retorno (PORT4-01).
 * Cada candidato passa pela MESMA regra do agendamento da equipe
 * (`assertSlotAvailable`: grade configurada, folga mínima e conflitos) — a
 * disponibilidade nunca diverge do que o agendamento aceitaria.
 */
export class ListAvailableSlots {
  constructor(
    private readonly patients: PatientRepository,
    private readonly appointments: AppointmentRepository,
    private readonly procedures: ProcedureRepository,
    private readonly scheduleConfig?: ScheduleConfigRepository,
    availability?: ScheduleAvailabilityRepository,
  ) {
    // Uma listagem testa dezenas de candidatos do mesmo dia: bloqueios e
    // horário do profissional são lidos uma vez só.
    this.availability = availability && memoizeAvailability(availability);
  }

  private readonly availability?: ScheduleAvailabilityRepository;

  async execute(input: ListAvailableSlotsInput): Promise<AvailableSlot[]> {
    const request = await this.resolveRequest(input);

    const config =
      (await this.scheduleConfig?.get()) ?? DEFAULT_SCHEDULE_CONFIG;
    const day = parseLocalDate(input.date);
    if (!day || !config.weekdays.includes(day.getDay())) {
      return [];
    }

    const now = input.now ?? new Date();
    const candidates = candidateSlots(
      day,
      config,
      request.durationMinutes,
    ).filter(
      // Horário já passado não é ofertado.
      (slot) => slot.startsAt.getTime() > now.getTime(),
    );

    const slots: AvailableSlot[] = [];
    for (const candidate of candidates) {
      if (await this.isFree(candidate, request, config)) {
        slots.push(candidate);
      }
    }
    return slots;
  }

  private async resolveRequest(
    input: ListAvailableSlotsInput,
  ): Promise<SlotRequest> {
    if (input.appointmentId !== undefined) {
      // Remarcação: a consulta precisa ser do próprio paciente; ela mesma não
      // conta como conflito do novo horário.
      const appointment = await findOwnAppointment(
        this.patients,
        this.appointments,
        input.patientId,
        input.appointmentId,
      );
      return {
        durationMinutes: Math.round(
          (appointment.slot.end.getTime() - appointment.slot.start.getTime()) /
            MINUTE_MS,
        ),
        professionalId: appointment.professionalId,
        excludeId: appointment.id,
      };
    }
    await this.assertActivePatient(input.patientId);
    const procedure = await this.assertOfferableProcedure(input.procedureId);
    // Sem profissional: regra global de conflito (default seguro).
    return { durationMinutes: procedure.durationMinutes, professionalId: null };
  }

  /** Escopo da sessão: só paciente cadastrado e ativo consulta horários. */
  private async assertActivePatient(patientId: string): Promise<void> {
    const patient = await this.patients.findById(patientId);
    if (!patient?.isActive) {
      throw new NotFoundError('Paciente', patientId);
    }
  }

  /** Procedimento inativo não é ofertado ao paciente. */
  private async assertOfferableProcedure(procedureId: string) {
    const procedure = await this.procedures.findById(procedureId);
    if (!procedure?.isActive) {
      throw new NotFoundError('Procedimento', procedureId);
    }
    return procedure;
  }

  private async isFree(
    candidate: AvailableSlot,
    request: SlotRequest,
    config: typeof DEFAULT_SCHEDULE_CONFIG,
  ): Promise<boolean> {
    try {
      await assertSlotAvailable(
        this.appointments,
        TimeSlot.create(candidate.startsAt, candidate.endsAt),
        request.excludeId,
        config,
        request.professionalId,
        this.availability,
      );
      return true;
    } catch (error) {
      // Só indisponibilidade de negócio significa "ocupado". Falha de
      // infraestrutura propaga — agenda vazia por erro de banco esconderia o
      // problema e faria o paciente achar que não há horário.
      if (
        error instanceof SchedulingConflictError ||
        error instanceof ValidationError
      ) {
        return false;
      }
      throw error;
    }
  }
}

/** Horários candidatos do dia: passo igual à duração, dentro da grade. */
function candidateSlots(
  day: Date,
  config: { startHour: number; endHour: number },
  durationMinutes: number,
): AvailableSlot[] {
  const durationMs = durationMinutes * MINUTE_MS;
  const closesAt = new Date(day);
  closesAt.setHours(config.endHour, 0, 0, 0);
  const start = new Date(day);
  start.setHours(config.startHour, 0, 0, 0);

  const candidates: AvailableSlot[] = [];
  for (
    let startsAt = start;
    startsAt.getTime() + durationMs <= closesAt.getTime();
    startsAt = new Date(startsAt.getTime() + durationMs)
  ) {
    candidates.push({
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMs),
    });
  }
  return candidates;
}

/** AAAA-MM-DD → data local; null quando o formato é inválido. */
function parseLocalDate(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const parsed = new Date(year, month - 1, day);
  // 2026-02-31 viraria 3 de março: rejeita em vez de ofertar o dia errado.
  const isRealDate =
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day;
  return isRealDate ? parsed : null;
}

/** Leituras de disponibilidade em cache durante uma listagem. */
function memoizeAvailability(
  source: ScheduleAvailabilityRepository,
): ScheduleAvailabilityRepository {
  const closures = new Map<string, ReturnType<typeof source.listClosures>>();
  const hours = new Map<
    string,
    ReturnType<typeof source.getProfessionalHours>
  >();
  // Métodos delegados explicitamente: spread de instância de classe perderia
  // os métodos do protótipo.
  return {
    findClosureById: (id) => source.findClosureById(id),
    saveClosure: (closure) => source.saveClosure(closure),
    deleteClosure: (id) => source.deleteClosure(id),
    replaceProfessionalHours: (id, windows) =>
      source.replaceProfessionalHours(id, windows),
    listClosures: (range) => {
      const key = `${range.from}|${range.to}`;
      const cached = closures.get(key) ?? source.listClosures(range);
      closures.set(key, cached);
      return cached;
    },
    getProfessionalHours: (professionalId) => {
      const cached =
        hours.get(professionalId) ??
        source.getProfessionalHours(professionalId);
      hours.set(professionalId, cached);
      return cached;
    },
  };
}
