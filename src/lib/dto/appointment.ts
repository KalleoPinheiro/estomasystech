import type {
  Appointment,
  CancellationOrigin,
} from '@/domain/scheduling/appointment';

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
  cancelledBy: CancellationOrigin | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Pedido do paciente dentro da antecedência mínima da clínica. */
  cancelledLate: boolean;
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
  cancelledBy: appointment.cancellation?.by ?? null,
  cancelledAt: appointment.cancellation?.at.toISOString() ?? null,
  cancelReason: appointment.cancellation?.reason ?? null,
  cancelledLate: appointment.cancellation?.late ?? false,
});

/** Consulta vista pelos portais: sem preço e sem anotações internas da equipe. */
export interface PortalAppointmentDto {
  id: string;
  startsAt: string;
  endsAt: string;
  procedure: string;
  status: string;
  /** Quem cancelou — o portal só alerta cancelamentos feitos pela clínica. */
  cancelledBy: CancellationOrigin | null;
}

export const toPortalAppointmentDto = (
  appointment: Appointment,
): PortalAppointmentDto => ({
  id: appointment.id,
  startsAt: appointment.slot.start.toISOString(),
  endsAt: appointment.slot.end.toISOString(),
  procedure: appointment.procedure,
  status: appointment.status,
  cancelledBy: appointment.cancellation?.by ?? null,
});
