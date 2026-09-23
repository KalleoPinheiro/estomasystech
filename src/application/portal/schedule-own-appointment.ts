import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import type { ProcedureRepository } from '@/domain/catalog/procedure-repository';
import type { FollowUpRepository } from '@/domain/followup/follow-up-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import type { ScheduleAvailabilityRepository } from '@/domain/scheduling/schedule-availability';
import type { ScheduleConfigRepository } from '@/domain/scheduling/schedule-config';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

export interface ScheduleOwnAppointmentInput {
  /** Relógio da operação — injetável para teste. */
  now?: Date;
  /** Email da sessão — define o paciente, nunca vem do corpo da requisição. */
  email: string;
  procedureId: string;
  startsAt: Date;
  /** Retorno que originou o agendamento (recall de 1 clique do paciente). */
  followUpId?: string | null;
}

const MINUTE_MS = 60_000;

/**
 * Agendamento de retorno pelo próprio paciente (PORT4-04..07).
 * Escopo forçado pela sessão; preço e duração vêm do catálogo (o paciente não
 * negocia valor). Sem profissional atribuído: mantém a regra global de
 * conflito, que é a mais restritiva — default seguro.
 */
export class ScheduleOwnAppointment {
  constructor(
    private readonly patients: PatientRepository,
    private readonly appointments: AppointmentRepository,
    private readonly procedures: ProcedureRepository,
    private readonly followUps: FollowUpRepository,
    private readonly scheduleConfig?: ScheduleConfigRepository,
    private readonly availability?: ScheduleAvailabilityRepository,
  ) {}

  async execute(input: ScheduleOwnAppointmentInput): Promise<Appointment> {
    const patient = await this.patients.findByEmail(input.email);
    if (!patient?.isActive) {
      throw new NotFoundError('Paciente', input.email);
    }

    const procedure = await this.procedures.findById(input.procedureId);
    if (!procedure?.isActive) {
      throw new NotFoundError('Procedimento', input.procedureId);
    }

    // A listagem de horários não oferta o passado; o POST é alcançável direto,
    // então a regra também vale aqui (PORT4-04).
    if (input.startsAt.getTime() <= (input.now ?? new Date()).getTime()) {
      throw new ValidationError('Escolha um horário futuro para o retorno');
    }

    const followUp = await this.resolveOwnFollowUp(
      input.followUpId ?? null,
      patient.id,
    );

    const appointment = await new ScheduleAppointment(
      this.appointments,
      this.patients,
      this.scheduleConfig,
      this.availability,
    ).execute({
      patientId: patient.id,
      startsAt: input.startsAt,
      endsAt: new Date(
        input.startsAt.getTime() + procedure.durationMinutes * MINUTE_MS,
      ),
      procedure: procedure.name,
      priceCents: procedure.priceCents,
      procedureId: procedure.id,
    });

    // Só sai da pendência depois que a consulta existe (PORT4-06).
    if (followUp && followUp.status === 'pending') {
      await this.followUps.save(followUp.markScheduled());
    }
    return appointment;
  }

  /**
   * Follow-up precisa ser do próprio paciente — de outro, responde NotFound
   * (não vaza existência), mesma política do resto do portal.
   */
  private async resolveOwnFollowUp(
    followUpId: string | null,
    patientId: string,
  ) {
    if (!followUpId) {
      return null;
    }
    const followUp = await this.followUps.findById(followUpId);
    if (!followUp || followUp.patientId !== patientId) {
      throw new NotFoundError('Retorno', followUpId);
    }
    return followUp;
  }
}
