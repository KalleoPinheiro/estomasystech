import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertSlotAvailable } from '@/application/appointments/assert-slot-available';
import { CreatePatient } from '@/application/patients/create-patient';
import { ListAvailableSlots } from '@/application/portal/list-available-slots';
import { Procedure } from '@/domain/catalog/procedure';
import { Appointment } from '@/domain/scheduling/appointment';
import { createScheduleClosure } from '@/domain/scheduling/schedule-availability';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryProcedureRepository,
  InMemoryScheduleAvailabilityRepository,
  InMemoryScheduleConfigRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { portalPatientId } from '../support/portal-identity';

// 2026-07-20 = segunda. Testes rodam com TZ=UTC.
const DAY = '2026-07-20';
const NOW = new Date('2026-07-19T12:00:00Z');
const PROFESSIONALS = ['pro-a', 'pro-b', null] as const;

/** Gerador determinístico (mulberry32) — o teste é reproduzível. */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Feature: /slots em lote dá o mesmo resultado que um teste por candidato (#360)', () => {
  let patients: InMemoryPatientRepository;
  let appointments: InMemoryAppointmentRepository;
  let procedures: InMemoryProcedureRepository;
  let availability: InMemoryScheduleAvailabilityRepository;
  let scheduleConfig: InMemoryScheduleConfigRepository;
  let procedure: Procedure;

  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    procedures = new InMemoryProcedureRepository();
    availability = new InMemoryScheduleAvailabilityRepository();
    scheduleConfig = new InMemoryScheduleConfigRepository();
    await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    procedure = Procedure.create({
      name: 'Curativo',
      priceCents: 15000,
      durationMinutes: 45,
    });
    await procedures.save(procedure);
  });

  const seedAppointment = async (
    rand: () => number,
    patientId: string,
  ): Promise<Appointment> => {
    const startMinute = 7 * 60 + Math.floor(rand() * 12 * 60);
    const length = 15 + Math.floor(rand() * 4) * 15;
    const start = new Date(Date.UTC(2026, 6, 20, 0, startMinute, 0));
    let appointment = Appointment.create({
      patientId,
      slot: TimeSlot.create(start, new Date(start.getTime() + length * 60_000)),
      procedure: 'Curativo',
      price: Money.fromCents(15000),
      professionalId:
        PROFESSIONALS[Math.floor(rand() * PROFESSIONALS.length)] ?? null,
    });
    if (rand() < 0.2) {
      appointment = appointment.cancel();
    }
    await appointments.save(appointment);
    return appointment;
  };

  /** O algoritmo anterior: `assertSlotAvailable` (uma consulta) por candidato. */
  const perCandidate = async (
    config: ScheduleConfig,
    professionalId: string | null,
    excludeId?: string,
  ) => {
    const durationMs = 45 * 60_000;
    const free: number[] = [];
    const open = Date.UTC(2026, 6, 20, config.startHour);
    const close = Date.UTC(2026, 6, 20, config.endHour);
    for (let t = open; t + durationMs <= close; t += durationMs) {
      try {
        await assertSlotAvailable(
          appointments,
          TimeSlot.create(new Date(t), new Date(t + durationMs)),
          excludeId,
          config,
          professionalId,
          availability,
        );
        free.push(t);
      } catch {
        // ocupado
      }
    }
    return free;
  };

  const batched = async (patientId: string) =>
    (
      await new ListAvailableSlots(
        patients,
        appointments,
        procedures,
        scheduleConfig,
        availability,
      ).execute({ patientId, procedureId: procedure.id, date: DAY, now: NOW })
    ).map((slot) => slot.startsAt.getTime());

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'agenda aleatória (semente %i) → mesmos horários livres',
    async (seed) => {
      const rand = rng(seed);
      const patientId = await portalPatientId(patients, 'maria@example.com');
      for (let i = 0; i < 12; i++) {
        await seedAppointment(rand, patientId);
      }
      await scheduleConfig.save({
        ...DEFAULT_SCHEDULE_CONFIG,
        minGapMinutes: [0, 15, 30][seed % 3] ?? 15,
        lunchBreak:
          seed % 2 === 0 ? { startMinute: 12 * 60, endMinute: 13 * 60 } : null,
      });
      const config = (await scheduleConfig.get()) ?? DEFAULT_SCHEDULE_CONFIG;

      expect(await batched(patientId)).toEqual(
        await perCandidate(config, null),
      );
    },
  );

  it('com recesso da clínica em outro dia e agenda cheia → mesmos horários', async () => {
    const rand = rng(99);
    const patientId = await portalPatientId(patients, 'maria@example.com');
    for (let i = 0; i < 10; i++) {
      await seedAppointment(rand, patientId);
    }
    await availability.saveClosure(
      createScheduleClosure({ startsOn: '2026-07-21', reason: 'Recesso' }),
    );
    const config = (await scheduleConfig.get()) ?? DEFAULT_SCHEDULE_CONFIG;

    expect(await batched(patientId)).toEqual(await perCandidate(config, null));
  });

  it('remarcação: ignora a própria consulta e filtra pelo profissional dela', async () => {
    const rand = rng(21);
    const patientId = await portalPatientId(patients, 'maria@example.com');
    for (let i = 0; i < 10; i++) {
      await seedAppointment(rand, patientId);
    }
    const own = Appointment.create({
      patientId,
      slot: TimeSlot.create(
        new Date('2026-07-22T10:00:00Z'),
        new Date('2026-07-22T10:30:00Z'),
      ),
      procedure: 'Curativo',
      price: Money.fromCents(15000),
      professionalId: 'pro-a',
    });
    await appointments.save(own);
    const config = (await scheduleConfig.get()) ?? DEFAULT_SCHEDULE_CONFIG;

    const slots = await new ListAvailableSlots(
      patients,
      appointments,
      procedures,
      scheduleConfig,
      availability,
    ).execute({ patientId, appointmentId: own.id, date: DAY, now: NOW });

    // Duração da consulta própria = 30 min: o oráculo percorre a mesma grade.
    const durationMs = 30 * 60_000;
    const expected: number[] = [];
    const open = Date.UTC(2026, 6, 20, config.startHour);
    const close = Date.UTC(2026, 6, 20, config.endHour);
    for (let t = open; t + durationMs <= close; t += durationMs) {
      try {
        await assertSlotAvailable(
          appointments,
          TimeSlot.create(new Date(t), new Date(t + durationMs)),
          own.id,
          config,
          'pro-a',
          availability,
        );
        expected.push(t);
      } catch {
        // ocupado
      }
    }
    expect(slots.map((slot) => slot.startsAt.getTime())).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it('lê as consultas do dia em uma única consulta, não uma por horário', async () => {
    const rand = rng(7);
    const patientId = await portalPatientId(patients, 'maria@example.com');
    for (let i = 0; i < 8; i++) {
      await seedAppointment(rand, patientId);
    }
    const spy = vi.spyOn(appointments, 'findConflicting');

    const slots = await batched(patientId);

    expect(slots.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
