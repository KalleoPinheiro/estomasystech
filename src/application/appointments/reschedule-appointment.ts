import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import type { ScheduleAvailabilityRepository } from '@/domain/scheduling/schedule-availability';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfigRepository,
} from '@/domain/scheduling/schedule-config';
import { NotFoundError } from '@/domain/shared/errors';
import { TimeSlot } from '@/domain/shared/time-slot';
import { assertSlotAvailable } from './assert-slot-available';

export interface RescheduleAppointmentInput {
  id: string;
  startsAt: Date;
  endsAt: Date;
}

export class RescheduleAppointment {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly scheduleConfig?: ScheduleConfigRepository,
    private readonly availability?: ScheduleAvailabilityRepository,
  ) {}

  async execute(input: RescheduleAppointmentInput): Promise<Appointment> {
    const appointment = await this.appointments.findById(input.id);
    if (!appointment) {
      throw new NotFoundError('Consulta', input.id);
    }

    const slot = TimeSlot.create(input.startsAt, input.endsAt);
    const config =
      (await this.scheduleConfig?.get()) ?? DEFAULT_SCHEDULE_CONFIG;
    await assertSlotAvailable(
      this.appointments,
      slot,
      appointment.id,
      config,
      appointment.professionalId,
      this.availability,
    );

    const rescheduled = appointment.reschedule(slot);
    await this.appointments.save(rescheduled);

    // Sincronização com Google Calendar acontece fora do request (SyncAppointmentCalendar).
    return rescheduled;
  }
}
