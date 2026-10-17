import { after } from 'next/server';
import { SyncAppointmentCalendar } from '@/application/appointments/sync-appointment-calendar';
import {
  NullCalendarGateway,
  resolveCalendarGateway,
} from '@/application/ports/calendar-gateway';
import type { Services } from '@/infrastructure/container';
import { logError } from '@/lib/log-error';

type CalendarServices = Pick<
  Services,
  'appointments' | 'patients' | 'calendar'
>;

/** `APP_URL` só se for http(s) válida; sem barra final. Inválida/ausente: sem link. */
function publicAppUrl(): string | null {
  const raw = process.env.APP_URL;
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Agenda a sincronização com o Google Calendar para depois da resposta (after()).
 * A API do Google fora do ar ou lenta não afeta a latência nem o resultado do request.
 */
export function scheduleCalendarSync(
  services: CalendarServices,
  action: (sync: SyncAppointmentCalendar) => Promise<void>,
): void {
  if (services.calendar instanceof NullCalendarGateway) {
    return;
  }
  after(async () => {
    try {
      // Gateway preguiçoso: a credencial é lida aqui, já fora do tempo de
      // resposta; se não houver conta conectada, resolve para o nulo.
      const calendar = await resolveCalendarGateway(services.calendar);
      if (calendar instanceof NullCalendarGateway) {
        return;
      }
      await action(
        new SyncAppointmentCalendar(
          services.appointments,
          services.patients,
          calendar,
          publicAppUrl(),
        ),
      );
    } catch (error) {
      logError('Google Calendar: falha na sincronização pós-request', error);
    }
  });
}
