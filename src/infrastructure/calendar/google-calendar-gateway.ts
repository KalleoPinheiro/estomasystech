import { type calendar_v3, google } from 'googleapis';
import type {
  CalendarEventInput,
  CalendarGateway,
} from '@/application/ports/calendar-gateway';
import { logError } from '@/lib/log-error';

export interface GoogleCalendarConfig {
  serviceAccountEmail: string;
  privateKey: string;
  calendarId: string;
}

export function googleCalendarConfigFromEnv(): GoogleCalendarConfig | null {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!serviceAccountEmail || !privateKey || !calendarId) {
    return null;
  }
  return {
    serviceAccountEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    calendarId,
  };
}

export interface OAuthCalendarInput {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Calendário de destino; "primary" = calendário principal da conta logada. */
  calendarId?: string;
}

export class GoogleCalendarGateway implements CalendarGateway {
  private constructor(
    private readonly client: calendar_v3.Calendar,
    private readonly calendarId: string,
  ) {}

  /** Autenticação por service account (calendário compartilhado com a service account). */
  static withServiceAccount(
    config: GoogleCalendarConfig,
  ): GoogleCalendarGateway {
    const auth = new google.auth.JWT({
      email: config.serviceAccountEmail,
      key: config.privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    return new GoogleCalendarGateway(
      google.calendar({ version: 'v3', auth }),
      config.calendarId,
    );
  }

  /** Autenticação pela conta Google logada (login com Google) — eventos no calendário do usuário. */
  static withOAuth(input: OAuthCalendarInput): GoogleCalendarGateway {
    const auth = new google.auth.OAuth2(input.clientId, input.clientSecret);
    auth.setCredentials({ refresh_token: input.refreshToken });
    return new GoogleCalendarGateway(
      google.calendar({ version: 'v3', auth }),
      input.calendarId ?? 'primary',
    );
  }

  private toEventBody(input: CalendarEventInput): calendar_v3.Schema$Event {
    return {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startsAt.toISOString() },
      end: { dateTime: input.endsAt.toISOString() },
    };
  }

  async createEvent(input: CalendarEventInput): Promise<string | null> {
    try {
      const response = await this.client.events.insert({
        calendarId: this.calendarId,
        requestBody: this.toEventBody(input),
      });
      return response.data.id ?? null;
    } catch (error) {
      logError('Google Calendar: falha ao criar evento', error);
      return null;
    }
  }

  async updateEvent(eventId: string, input: CalendarEventInput): Promise<void> {
    try {
      await this.client.events.patch({
        calendarId: this.calendarId,
        eventId,
        requestBody: this.toEventBody(input),
      });
    } catch (error) {
      logError('Google Calendar: falha ao atualizar evento', error);
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    try {
      await this.client.events.delete({
        calendarId: this.calendarId,
        eventId,
      });
    } catch (error) {
      logError('Google Calendar: falha ao remover evento', error);
    }
  }
}
