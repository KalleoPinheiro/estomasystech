import { beforeEach, describe, expect, it } from 'vitest';
import { RescheduleAppointment } from '@/application/appointments/reschedule-appointment';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { ScheduleRecurringAppointments } from '@/application/appointments/schedule-recurring-appointments';
import { SyncAppointmentCalendar } from '@/application/appointments/sync-appointment-calendar';
import { CreatePatient } from '@/application/patients/create-patient';
import type {
  CalendarEventInput,
  CalendarGateway,
} from '@/application/ports/calendar-gateway';
import type { Patient } from '@/domain/patient/patient';
import { DEFAULT_SCHEDULE_CONFIG } from '@/domain/scheduling/schedule-config';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryScheduleConfigRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
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
describe('Feature: Lacunas de cobertura — remarcação, série recorrente e sincronização de calendário', () => {
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

  const schedule = (
    startsAt: string,
    endsAt: string,
    professionalId: string | null = null,
  ) =>
    new ScheduleAppointment(appointmentRepo, patientRepo).execute({
      patientId: maria.id,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      procedure: 'Troca de bolsa',
      priceCents: 25000,
      professionalId,
    });

  describe('Cenário: remarcar consulta — lacunas', () => {
    it('Dado id inexistente, Quando remarcar, Então lança NotFoundError', async () => {
      await expect(
        new RescheduleAppointment(appointmentRepo).execute({
          id: 'ghost',
          startsAt: new Date('2026-07-21T09:00:00Z'),
          endsAt: new Date('2026-07-21T10:00:00Z'),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('Dado repositório de configuração de agenda customizado, Quando remarcar, Então usa a config salva em vez do padrão', async () => {
      const scheduleConfig = new InMemoryScheduleConfigRepository();
      await scheduleConfig.save({
        ...DEFAULT_SCHEDULE_CONFIG,
        startHour: 6,
        endHour: 22,
      });
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );

      // Fora do horário padrão (08–18h) mas dentro da config customizada (06–22h).
      const rescheduled = await new RescheduleAppointment(
        appointmentRepo,
        scheduleConfig,
      ).execute({
        id: appointment.id,
        startsAt: new Date('2026-07-21T06:30:00Z'),
        endsAt: new Date('2026-07-21T07:30:00Z'),
      });

      expect(rescheduled.slot.start).toEqual(new Date('2026-07-21T06:30:00Z'));
    });

    it('Dado repositório de configuração de agenda sem config salva (get retorna null), Quando remarcar, Então cai no padrão', async () => {
      const scheduleConfig = new InMemoryScheduleConfigRepository();
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );

      await expect(
        new RescheduleAppointment(appointmentRepo, scheduleConfig).execute({
          id: appointment.id,
          startsAt: new Date('2026-07-21T19:00:00Z'),
          endsAt: new Date('2026-07-21T20:00:00Z'),
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Cenário: sincronização com Google Calendar — lacunas', () => {
    const sync = () =>
      new SyncAppointmentCalendar(appointmentRepo, patientRepo, calendar);

    it('Dado id de consulta inexistente, Quando sincronizar criação, Então não chama o calendário', async () => {
      await sync().created('ghost');

      expect(calendar.created).toHaveLength(0);
    });

    it('Dado paciente da consulta não encontrado, Quando sincronizar criação, Então usa rótulo com o id do paciente', async () => {
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      // Repositório de pacientes vazio simula paciente que não existe mais (removido/órfão).
      const emptyPatientRepo = new InMemoryPatientRepository();
      const syncWithoutPatient = new SyncAppointmentCalendar(
        appointmentRepo,
        emptyPatientRepo,
        calendar,
      );

      await syncWithoutPatient.created(appointment.id);

      expect(calendar.created).toHaveLength(1);
      expect(calendar.created[0].title).toBe('Consulta: Paciente');
      expect(calendar.created[0].description).toContain(appointment.patientId);
    });

    it('Dado id de consulta inexistente, Quando sincronizar remarcação, Então não chama o calendário', async () => {
      await sync().rescheduled('ghost');

      expect(calendar.updated).toHaveLength(0);
    });

    it('Dado consulta sem evento no calendário, Quando sincronizar remarcação, Então não chama o calendário', async () => {
      calendar.nextEventId = null;
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await sync().created(appointment.id);

      await sync().rescheduled(appointment.id);

      expect(calendar.updated).toHaveLength(0);
    });
  });

  describe('Cenário: série recorrente — lacunas', () => {
    const baseInput = {
      patientId: '',
      startsAt: new Date('2026-07-20T09:00:00Z'),
      endsAt: new Date('2026-07-20T10:00:00Z'),
      procedure: 'Curativo',
      priceCents: 15000,
    };

    it('Dado weeksInterval fora de 1–8, Quando agendar série, Então lança ValidationError', async () => {
      await expect(
        new ScheduleRecurringAppointments(
          new ScheduleAppointment(appointmentRepo, patientRepo),
        ).execute({
          ...baseInput,
          patientId: maria.id,
          occurrences: 2,
          weeksInterval: 9,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('Dado weeksInterval customizado (2 semanas), Quando agendar série, Então ocorrências ficam espaçadas pelo intervalo', async () => {
      const result = await new ScheduleRecurringAppointments(
        new ScheduleAppointment(appointmentRepo, patientRepo),
      ).execute({
        ...baseInput,
        patientId: maria.id,
        occurrences: 3,
        weeksInterval: 2,
      });

      expect(result.created).toHaveLength(3);
      expect(result.created[1].slot.start.toISOString()).toBe(
        '2026-08-03T09:00:00.000Z',
      );
      expect(result.created[2].slot.start.toISOString()).toBe(
        '2026-08-17T09:00:00.000Z',
      );
    });
  });
});
