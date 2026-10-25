import type { PatientRepository } from '@/domain/patient/patient-repository';
import type {
  Appointment,
  AppointmentStatus,
} from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';

export interface AppointmentWithPatient {
  appointment: Appointment;
  patientName: string;
  /** Para desambiguar homônimos nas listas (CONTEXT.md). */
  patientBirthDate: Date | null;
}

export interface ListAppointmentsInput {
  from: Date;
  to: Date;
  professionalId?: string;
  /** Sem o campo, todos os status; lista vazia, nenhum. */
  statuses?: readonly AppointmentStatus[];
}

export class ListAppointments {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(
    input: ListAppointmentsInput,
  ): Promise<AppointmentWithPatient[]> {
    const appointments = await this.appointments.findInRange(
      input.from,
      input.to,
      {
        professionalId: input.professionalId,
        statuses: input.statuses,
      },
    );
    const patients = await this.patients.findByIds(
      appointments.map((a) => a.patientId),
    );
    const byId = new Map(patients.map((p) => [p.id, p]));

    return appointments.map((appointment) => ({
      appointment,
      patientName:
        byId.get(appointment.patientId)?.fullName ?? 'Paciente desconhecido',
      patientBirthDate: byId.get(appointment.patientId)?.birthDate ?? null,
    }));
  }
}
