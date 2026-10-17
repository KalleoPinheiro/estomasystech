import type {
  CalendarEventInput,
  CalendarGateway,
} from '@/application/ports/calendar-gateway';
import { patientInitials } from '@/domain/patient/initials';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';

/**
 * Conteúdo do evento externo (#217, AGE-RN-18): só iniciais do paciente, o
 * horário e o link para a consulta no VittaFlow. Nunca nome completo, telefone
 * nem procedimento — o calendário é de terceiro e pode ser pessoal/compartilhado.
 * Criação e remarcação usam o mesmo conteúdo.
 */
function eventContent(
  appointment: Appointment,
  initials: string | null,
  appUrl: string | null,
): CalendarEventInput {
  return {
    title: initials ? `Consulta · ${initials}` : 'Consulta',
    description: appUrl
      ? `Abrir no VittaFlow: ${consultationLink(appUrl, appointment)}`
      : '',
    startsAt: appointment.slot.start,
    endsAt: appointment.slot.end,
  };
}

/** Link que abre a agenda no mês da consulta, já com os detalhes dela. */
export function consultationLink(
  appUrl: string,
  appointment: Appointment,
): string {
  const query = new URLSearchParams({
    consulta: appointment.id,
    em: appointment.slot.start.toISOString(),
  });
  return `${appUrl}/agenda?${query.toString()}`;
}

/**
 * Sincronização com Google Calendar fora do caminho crítico do request.
 * Executada via after() nas rotas: lentidão/indisponibilidade da API do Google
 * não bloqueia nem falha o agendamento já persistido.
 */
export class SyncAppointmentCalendar {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
    private readonly calendar: CalendarGateway,
    /** Base pública (`APP_URL`, sem barra final); `null` omite o link. */
    private readonly appUrl: string | null = null,
  ) {}

  /** Cria o evento do agendamento e persiste o id externo. */
  async created(appointmentId: string): Promise<void> {
    const appointment = await this.appointments.findById(appointmentId);
    if (!appointment || appointment.googleEventId) {
      return;
    }
    const eventId = await this.calendar.createEvent(
      eventContent(
        appointment,
        await this.initialsOf(appointment),
        this.appUrl,
      ),
    );
    if (eventId) {
      await this.appointments.save(appointment.withGoogleEventId(eventId));
    }
  }

  /** Atualiza o evento após remarcação. */
  async rescheduled(appointmentId: string): Promise<void> {
    const appointment = await this.appointments.findById(appointmentId);
    if (!appointment?.googleEventId) {
      return;
    }
    await this.calendar.updateEvent(
      appointment.googleEventId,
      eventContent(
        appointment,
        await this.initialsOf(appointment),
        this.appUrl,
      ),
    );
  }

  /** Remove o evento após cancelamento/falta. */
  async removed(googleEventId: string): Promise<void> {
    await this.calendar.deleteEvent(googleEventId);
  }

  private async initialsOf(appointment: Appointment): Promise<string | null> {
    const patient = await this.patients.findById(appointment.patientId);
    return patient ? patientInitials(patient.fullName) : null;
  }
}
