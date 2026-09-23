import {
  APPOINTMENT_STATUSES,
  type Appointment,
  type AppointmentStatus,
} from '@/domain/scheduling/appointment';
import type {
  AppointmentRangeStats,
  AppointmentRepository,
  FindByPatientOptions,
  ProcedureRevenue,
} from '@/domain/scheduling/appointment-repository';
import type { TimeSlot } from '@/domain/shared/time-slot';

export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly appointments = new Map<string, Appointment>();

  async save(appointment: Appointment): Promise<void> {
    this.appointments.set(appointment.id, appointment);
  }

  async findById(id: string): Promise<Appointment | null> {
    return this.appointments.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<Appointment[]> {
    const unique = [...new Set(ids)];
    return unique.flatMap((id) => {
      const appointment = this.appointments.get(id);
      return appointment ? [appointment] : [];
    });
  }

  private matchesPatientOptions(
    appointment: Appointment,
    options?: FindByPatientOptions,
  ) {
    return (
      !options?.endsAfter ||
      appointment.slot.end.getTime() >= options.endsAfter.getTime()
    );
  }

  async findByPatientId(
    patientId: string,
    options?: FindByPatientOptions,
  ): Promise<Appointment[]> {
    return [...this.appointments.values()]
      .filter(
        (a) =>
          a.patientId === patientId && this.matchesPatientOptions(a, options),
      )
      .sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
  }

  async findByPatientIds(
    patientIds: string[],
    options?: FindByPatientOptions,
  ): Promise<Appointment[]> {
    const ids = new Set(patientIds);
    return [...this.appointments.values()]
      .filter(
        (a) => ids.has(a.patientId) && this.matchesPatientOptions(a, options),
      )
      .sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
  }

  async getStatsInRange(
    start: Date,
    end: Date,
  ): Promise<AppointmentRangeStats> {
    const inRange = [...this.appointments.values()].filter(
      (a) =>
        a.slot.start.getTime() < end.getTime() &&
        a.slot.end.getTime() > start.getTime(),
    );

    const byStatus = Object.fromEntries(
      APPOINTMENT_STATUSES.map((status) => [status, 0]),
    ) as Record<AppointmentStatus, number>;
    for (const appointment of inRange) {
      byStatus[appointment.status] += 1;
    }

    const revenueMap = new Map<string, ProcedureRevenue>();
    for (const appointment of inRange) {
      if (appointment.status !== 'completed') continue;
      const current = revenueMap.get(appointment.procedure) ?? {
        procedure: appointment.procedure,
        count: 0,
        totalCents: 0,
      };
      revenueMap.set(appointment.procedure, {
        procedure: appointment.procedure,
        count: current.count + 1,
        totalCents: current.totalCents + appointment.price.cents,
      });
    }
    const revenueByProcedure = [...revenueMap.values()].sort(
      (a, b) => b.totalCents - a.totalCents,
    );

    return { byStatus, revenueByProcedure };
  }

  async findInRange(
    start: Date,
    end: Date,
    options?: { professionalId?: string },
  ): Promise<Appointment[]> {
    return [...this.appointments.values()]
      .filter(
        (a) =>
          a.slot.start.getTime() < end.getTime() &&
          a.slot.end.getTime() > start.getTime() &&
          (!options?.professionalId ||
            a.professionalId === options.professionalId),
      )
      .sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
  }

  async findConflicting(
    slot: TimeSlot,
    excludeId?: string,
    professionalId?: string | null,
  ): Promise<Appointment[]> {
    return [...this.appointments.values()].filter((a) => {
      if (a.id === excludeId || !a.isActive || !a.slot.overlaps(slot)) {
        return false;
      }
      // Profissionais distintos e ambos definidos → sem conflito.
      if (
        professionalId &&
        a.professionalId &&
        a.professionalId !== professionalId
      ) {
        return false;
      }
      return true;
    });
  }
}
