import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MINIMIZE_CHUNK,
  MINIMIZE_PAUSE_MS,
  MinimizeCalendarEvents,
} from '@/application/appointments/minimize-calendar-events';
import type { CalendarGateway } from '@/application/ports/calendar-gateway';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

const CLINIC = 'clinica-1';

const gateway = (rewrite = vi.fn(async () => undefined)): CalendarGateway => ({
  createEvent: async () => null,
  updateEvent: async () => undefined,
  deleteEvent: async () => undefined,
  purgeEvent: async () => undefined,
  rewriteEvent: rewrite,
});

describe('Feature: Minimização do Google Agenda com relógio e pausa reais (#339)', () => {
  let patients: InMemoryPatientRepository;
  let appointments: InMemoryAppointmentRepository;
  let audit: InMemoryAuditEventRepository;
  let maria: Patient;

  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    audit = new InMemoryAuditEventRepository(CLINIC);
    maria = Patient.create({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    await patients.save(maria);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const seed = async (count: number) => {
    for (let i = 0; i < count; i += 1) {
      const start = new Date(Date.UTC(2026, 9, 20, 8, i));
      await appointments.save(
        Appointment.restore({
          id: `a${i}`,
          patientId: maria.id,
          slot: TimeSlot.create(start, new Date(start.getTime() + 600_000)),
          procedure: 'Troca de bolsa',
          price: Money.fromCents(25000),
          notes: null,
          status: 'scheduled',
          googleEventId: `evt-${i}`,
          createdAt: start,
        }),
      );
    }
  };

  it('Dado mais eventos que uma rajada e sem relógio injetado, Quando aplica, Então espera a pausa entre rajadas e audita com a data de hoje', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-21T09:00:00Z'));
    await seed(MINIMIZE_CHUNK + 1);
    const rewrite = vi.fn(async () => undefined);
    const job = new MinimizeCalendarEvents(
      CLINIC,
      appointments,
      patients,
      gateway(rewrite),
      audit,
      null,
    );

    const running = job.execute({ apply: true });
    await vi.advanceTimersByTimeAsync(MINIMIZE_PAUSE_MS);
    const summary = await running;

    expect(summary).toMatchObject({
      pending: MINIMIZE_CHUNK + 1,
      rewritten: MINIMIZE_CHUNK + 1,
      failed: 0,
    });
    const [event] = await audit.findAll();
    expect(event.resourceId).toBe('2026-10-21');
  });

  it('Dado consulta sem id de evento no Google, Quando aplica, Então nada é reescrito nela', async () => {
    const orphan = Appointment.restore({
      id: 'sem-evento',
      patientId: maria.id,
      slot: TimeSlot.create(
        new Date('2026-10-20T12:00:00Z'),
        new Date('2026-10-20T13:00:00Z'),
      ),
      procedure: 'Troca de bolsa',
      price: Money.fromCents(25000),
      notes: null,
      status: 'scheduled',
      googleEventId: null,
      createdAt: new Date('2026-10-01T12:00:00Z'),
    });
    vi.spyOn(appointments, 'findCalendarEventsToMinimize').mockResolvedValue([
      orphan,
    ]);
    const rewrite = vi.fn(async () => undefined);
    const job = new MinimizeCalendarEvents(
      CLINIC,
      appointments,
      patients,
      gateway(rewrite),
      audit,
      null,
      () => new Date('2026-10-21T09:00:00Z'),
    );

    await job.execute({ apply: true });

    expect(rewrite).not.toHaveBeenCalled();
  });
});
