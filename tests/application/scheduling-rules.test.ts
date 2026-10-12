import { beforeEach, describe, expect, it } from 'vitest';
import { ChangeAppointmentStatus } from '@/application/appointments/change-appointment-status';
import { RescheduleAppointment } from '@/application/appointments/reschedule-appointment';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { SyncAppointmentCalendar } from '@/application/appointments/sync-appointment-calendar';
import { CreatePatient } from '@/application/patients/create-patient';
import type {
  CalendarEventInput,
  CalendarGateway,
} from '@/application/ports/calendar-gateway';
import type { Patient } from '@/domain/patient/patient';
import {
  SchedulingConflictError,
  ValidationError,
} from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

class FakeCalendarGateway implements CalendarGateway {
  created: CalendarEventInput[] = [];
  updated: Array<{ eventId: string; input: CalendarEventInput }> = [];
  deleted: string[] = [];
  nextEventId: string | null = 'gcal-event-1';

  async createEvent(input: CalendarEventInput): Promise<string | null> {
    this.created = [...this.created, input];
    return this.nextEventId;
  }

  async updateEvent(eventId: string, input: CalendarEventInput): Promise<void> {
    this.updated = [...this.updated, { eventId, input }];
  }

  async purgeEvent(): Promise<void> {}

  async deleteEvent(eventId: string): Promise<void> {
    this.deleted = [...this.deleted, eventId];
  }
}

// 2026-07-20 é segunda-feira; horários em UTC (testes rodam com TZ=UTC).
describe('Feature: Regras de agendamento (horário comercial, intervalo de 15min, Google Calendar)', () => {
  let patientRepo: InMemoryPatientRepository;
  let appointmentRepo: InMemoryAppointmentRepository;
  let calendar: FakeCalendarGateway;
  let maria: Patient;

  beforeEach(async () => {
    patientRepo = new InMemoryPatientRepository();
    appointmentRepo = new InMemoryAppointmentRepository();
    calendar = new FakeCalendarGateway();
    maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
  });

  const schedule = (startsAt: string, endsAt: string) =>
    new ScheduleAppointment(appointmentRepo, patientRepo).execute({
      patientId: maria.id,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      procedure: 'Troca de bolsa',
      priceCents: 25000,
    });

  const sync = () =>
    new SyncAppointmentCalendar(appointmentRepo, patientRepo, calendar);

  describe('Cenário: horário comercial obrigatório', () => {
    it('Dado horário antes da abertura, Quando agendar, Então lança ValidationError', async () => {
      await expect(
        schedule('2026-07-20T06:00:00Z', '2026-07-20T07:00:00Z'),
      ).rejects.toThrow(ValidationError);
    });

    it('Dado horário após o fechamento, Quando agendar, Então lança ValidationError', async () => {
      await expect(
        schedule('2026-07-20T17:30:00Z', '2026-07-20T18:30:00Z'),
      ).rejects.toThrow(ValidationError);
    });

    it('Dado fim de semana, Quando agendar, Então lança ValidationError', async () => {
      await expect(
        schedule('2026-07-25T09:00:00Z', '2026-07-25T10:00:00Z'),
      ).rejects.toThrow(ValidationError);
    });

    it('Dado horário comercial em dia útil, Quando agendar, Então agenda com sucesso', async () => {
      await expect(
        schedule('2026-07-20T08:00:00Z', '2026-07-20T09:00:00Z'),
      ).resolves.toBeTruthy();
    });

    it('Dado remarcação para fora do expediente, Quando remarcar, Então lança ValidationError', async () => {
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );

      await expect(
        new RescheduleAppointment(appointmentRepo).execute({
          id: appointment.id,
          startsAt: new Date('2026-07-21T19:00:00Z'),
          endsAt: new Date('2026-07-21T20:00:00Z'),
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Cenário: intervalo mínimo de 15 minutos entre consultas', () => {
    it('Dado consulta 09:00–10:00, Quando agendar 10:00–11:00 (sem folga), Então lança SchedulingConflictError', async () => {
      await schedule('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z');

      await expect(
        schedule('2026-07-20T10:00:00Z', '2026-07-20T11:00:00Z'),
      ).rejects.toThrow(SchedulingConflictError);
    });

    it('Dado consulta 09:00–10:00, Quando agendar 10:10–11:00 (folga de 10min), Então lança SchedulingConflictError', async () => {
      await schedule('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z');

      await expect(
        schedule('2026-07-20T10:10:00Z', '2026-07-20T11:00:00Z'),
      ).rejects.toThrow(SchedulingConflictError);
    });

    it('Dado consulta 09:00–10:00, Quando agendar 10:15–11:00 (folga exata de 15min), Então agenda', async () => {
      await schedule('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z');

      await expect(
        schedule('2026-07-20T10:15:00Z', '2026-07-20T11:00:00Z'),
      ).resolves.toBeTruthy();
    });

    it('Dado consulta 10:00–11:00, Quando agendar terminando 09:50 (antes, folga de 10min), Então lança SchedulingConflictError', async () => {
      await schedule('2026-07-20T10:00:00Z', '2026-07-20T11:00:00Z');

      await expect(
        schedule('2026-07-20T09:00:00Z', '2026-07-20T09:50:00Z'),
      ).rejects.toThrow(SchedulingConflictError);
    });

    it('Dado remarcação violando a folga de outra consulta, Quando remarcar, Então lança SchedulingConflictError', async () => {
      const first = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await schedule('2026-07-20T11:00:00Z', '2026-07-20T12:00:00Z');

      await expect(
        new RescheduleAppointment(appointmentRepo).execute({
          id: first.id,
          startsAt: new Date('2026-07-20T12:05:00Z'),
          endsAt: new Date('2026-07-20T13:00:00Z'),
        }),
      ).rejects.toThrow(SchedulingConflictError);
    });
  });

  describe('Cenário: sincronização com Google Calendar (pós-request)', () => {
    it('Dado agendamento criado, Quando sincronizar, Então cria evento e persiste googleEventId', async () => {
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await sync().created(appointment.id);

      expect(calendar.created).toHaveLength(1);
      expect(calendar.created[0].title).toContain('Maria da Silva');

      const stored = await appointmentRepo.findById(appointment.id);
      expect(stored?.googleEventId).toBe('gcal-event-1');
    });

    it('Dado falha na criação do evento (null), Quando sincronizar, Então consulta persiste sem eventId', async () => {
      calendar.nextEventId = null;

      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await sync().created(appointment.id);

      const stored = await appointmentRepo.findById(appointment.id);
      expect(stored?.status).toBe('scheduled');
      expect(stored?.googleEventId).toBeNull();
    });

    it('Dado sincronização repetida, Quando sincronizar de novo, Então não duplica evento', async () => {
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await sync().created(appointment.id);
      await sync().created(appointment.id);

      expect(calendar.created).toHaveLength(1);
    });

    it('Dado consulta com evento, Quando remarcar e sincronizar, Então atualiza evento no calendário', async () => {
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await sync().created(appointment.id);

      await new RescheduleAppointment(appointmentRepo).execute({
        id: appointment.id,
        startsAt: new Date('2026-07-21T14:00:00Z'),
        endsAt: new Date('2026-07-21T15:00:00Z'),
      });
      await sync().rescheduled(appointment.id);

      expect(calendar.updated).toHaveLength(1);
      expect(calendar.updated[0].eventId).toBe('gcal-event-1');
      expect(calendar.updated[0].input.startsAt).toEqual(
        new Date('2026-07-21T14:00:00Z'),
      );
    });

    it('Dado consulta com evento, Quando cancelar e sincronizar, Então remove evento do calendário', async () => {
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await sync().created(appointment.id);

      const changed = await new ChangeAppointmentStatus(
        appointmentRepo,
      ).execute({
        id: appointment.id,
        action: 'cancel',
      });
      if (changed.googleEventId) {
        await sync().removed(changed.googleEventId);
      }

      expect(calendar.deleted).toEqual(['gcal-event-1']);
    });

    it('Dado consulta sem evento, Quando cancelar, Então não chama o calendário', async () => {
      calendar.nextEventId = null;
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await sync().created(appointment.id);

      const changed = await new ChangeAppointmentStatus(
        appointmentRepo,
      ).execute({
        id: appointment.id,
        action: 'cancel',
      });
      if (changed.googleEventId) {
        await sync().removed(changed.googleEventId);
      }

      expect(calendar.deleted).toHaveLength(0);
    });
  });
});
