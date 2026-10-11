import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { ProfessionalRepository } from '@/domain/professional/professional-repository';
import { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import type { ScheduleAvailabilityRepository } from '@/domain/scheduling/schedule-availability';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfigRepository,
} from '@/domain/scheduling/schedule-config';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { assertActiveProfessional } from '../scheduling/assert-active-professional';
import { assertSlotAvailable } from './assert-slot-available';

export interface ScheduleAppointmentInput {
  patientId: string;
  startsAt: Date;
  endsAt: Date;
  procedure: string;
  priceCents: number;
  notes?: string | null;
  professionalId?: string | null;
  procedureId?: string | null;
}

export class ScheduleAppointment {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
    private readonly scheduleConfig?: ScheduleConfigRepository,
    private readonly availability?: ScheduleAvailabilityRepository,
    /** Valida o `professionalId` (existe na empresa e está ativo, issue #219). */
    private readonly professionals?: ProfessionalRepository,
  ) {}

  /** Exposto para a série recorrente validar uma vez, antes das ocorrências. */
  async assertProfessional(professionalId?: string | null): Promise<void> {
    if (professionalId && this.professionals) {
      await assertActiveProfessional(this.professionals, professionalId);
    }
  }

  async execute(input: ScheduleAppointmentInput): Promise<Appointment> {
    const patient = await this.patients.findById(input.patientId);
    if (!patient) {
      throw new NotFoundError('Paciente', input.patientId);
    }
    if (!patient.isActive) {
      throw new ValidationError(
        'Não é possível agendar consulta para paciente inativo',
      );
    }

    await this.assertProfessional(input.professionalId);

    const slot = TimeSlot.create(input.startsAt, input.endsAt);
    const config =
      (await this.scheduleConfig?.get()) ?? DEFAULT_SCHEDULE_CONFIG;
    await assertSlotAvailable(
      this.appointments,
      slot,
      undefined,
      config,
      input.professionalId ?? null,
      this.availability,
    );

    const appointment = Appointment.create({
      patientId: input.patientId,
      slot,
      procedure: input.procedure,
      price: Money.fromCents(input.priceCents),
      notes: input.notes,
      professionalId: input.professionalId ?? null,
      procedureId: input.procedureId ?? null,
    });
    await this.appointments.save(appointment);

    // Sincronização com Google Calendar acontece fora do request (SyncAppointmentCalendar).
    return appointment;
  }
}
