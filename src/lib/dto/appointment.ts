import type { Appointment } from '@/domain/scheduling/appointment';

export interface AppointmentDto {
  id: string;
  patientId: string;
  patientName?: string;
  startsAt: string;
  endsAt: string;
  procedure: string;
  priceCents: number;
  notes: string | null;
  status: string;
  professionalId: string | null;
}

export const toAppointmentDto = (
  appointment: Appointment,
  patientName?: string,
): AppointmentDto => ({
  id: appointment.id,
  patientId: appointment.patientId,
  patientName,
  startsAt: appointment.slot.start.toISOString(),
  endsAt: appointment.slot.end.toISOString(),
  procedure: appointment.procedure,
  priceCents: appointment.price.cents,
  notes: appointment.notes,
  status: appointment.status,
  professionalId: appointment.professionalId,
});

/** Consulta vista pelos portais: sem preço e sem anotações internas da equipe. */
export interface PortalAppointmentDto {
  id: string;
  startsAt: string;
  endsAt: string;
  procedure: string;
  status: string;
}

export const toPortalAppointmentDto = (
  appointment: Appointment,
): PortalAppointmentDto => ({
  id: appointment.id,
  startsAt: appointment.slot.start.toISOString(),
  endsAt: appointment.slot.end.toISOString(),
  procedure: appointment.procedure,
  status: appointment.status,
});
