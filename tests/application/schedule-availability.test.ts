import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RescheduleAppointment } from '@/application/appointments/reschedule-appointment';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreatePatient } from '@/application/patients/create-patient';
import { ListAvailableSlots } from '@/application/portal/list-available-slots';
import {
  CreateScheduleClosure,
  DeleteScheduleClosure,
  SetProfessionalHours,
} from '@/application/scheduling/schedule-availability';
import { Procedure } from '@/domain/catalog/procedure';
import type { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import { createScheduleClosure } from '@/domain/scheduling/schedule-availability';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryProcedureRepository,
  InMemoryScheduleAvailabilityRepository,
  InMemoryScheduleConfigRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryProfessionalRepository } from '@/infrastructure/persistence/in-memory/in-memory-professional-repository';
import { portalPatientId } from '../support/portal-identity';

// 2026-07-20 = segunda. Testes rodam com TZ=UTC; grade padrão 8h–18h.
describe('Feature: Agenda por profissional, almoço e feriados', () => {
  let patients: InMemoryPatientRepository;
  let appointments: InMemoryAppointmentRepository;
  let professionals: InMemoryProfessionalRepository;
  let availability: InMemoryScheduleAvailabilityRepository;
  let scheduleConfig: InMemoryScheduleConfigRepository;
  let maria: Patient;
  let ana: Professional;

  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    professionals = new InMemoryProfessionalRepository();
    availability = new InMemoryScheduleAvailabilityRepository();
    scheduleConfig = new InMemoryScheduleConfigRepository();
    maria = await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    ana = Professional.create({ fullName: 'Dra. Ana' });
    await professionals.save(ana);
  });

  const schedule = (
    startsAt: string,
    endsAt: string,
    professionalId: string | null = null,
  ) =>
    new ScheduleAppointment(
      appointments,
      patients,
      scheduleConfig,
      availability,
    ).execute({
      patientId: maria.id,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      procedure: 'Curativo',
      priceCents: 10000,
      professionalId,
    });

  describe('Agendar', () => {
    it('Dado feriado da clínica, Quando agendar, Então ValidationError e nada é salvo', async () => {
      await availability.saveClosure(
        createScheduleClosure({ startsOn: '2026-07-20', reason: 'Feriado' }),
      );
      await expect(
        schedule('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z'),
      ).rejects.toThrow('Clínica fechada em 20/07/2026: Feriado');
      expect(
        await appointments.findInRange(
          new Date('2026-07-20T00:00:00Z'),
          new Date('2026-07-21T00:00:00Z'),
        ),
      ).toHaveLength(0);
    });

    it('Dado ausência da Dra. Ana, Quando agendar com ela, Então rejeita; sem profissional, aceita', async () => {
      await availability.saveClosure(
        createScheduleClosure({
          professionalId: ana.id,
          startsOn: '2026-07-20',
          reason: 'Congresso',
        }),
      );
      await expect(
        schedule('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z', ana.id),
      ).rejects.toThrow('Profissional ausente');
      await expect(
        schedule('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z'),
      ).resolves.toBeTruthy();
    });

    it('Dado horário da Dra. Ana só às quartas, Quando agendar com ela na segunda, Então rejeita', async () => {
      await availability.replaceProfessionalHours(ana.id, [
        { weekday: 3, startMinute: 480, endMinute: 1080 },
      ]);
      await expect(
        schedule('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z', ana.id),
      ).rejects.toThrow('Fora do horário do profissional');
      await expect(
        schedule('2026-07-22T09:00:00Z', '2026-07-22T10:00:00Z', ana.id),
      ).resolves.toBeTruthy();
    });

    it('Dado pausa de almoço na clínica, Quando agendar dentro dela, Então rejeita', async () => {
      await scheduleConfig.save({
        weekdays: [1, 2, 3, 4, 5],
        startHour: 8,
        endHour: 18,
        minGapMinutes: 15,
        lunchBreak: { startMinute: 720, endMinute: 780 },
      });
      await expect(
        schedule('2026-07-20T12:00:00Z', '2026-07-20T12:30:00Z'),
      ).rejects.toThrow(ValidationError);
    });

    it('Dado ausência, Quando remarcar para o dia dela, Então rejeita', async () => {
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
        ana.id,
      );
      await availability.saveClosure(
        createScheduleClosure({
          professionalId: ana.id,
          startsOn: '2026-07-21',
          reason: 'Férias',
        }),
      );
      await expect(
        new RescheduleAppointment(
          appointments,
          scheduleConfig,
          availability,
        ).execute({
          id: appointment.id,
          startsAt: new Date('2026-07-21T09:00:00Z'),
          endsAt: new Date('2026-07-21T10:00:00Z'),
        }),
      ).rejects.toThrow('Profissional ausente');
    });
  });

  describe('Horários do portal', () => {
    let procedures: InMemoryProcedureRepository;
    let curativo: Procedure;
    const now = new Date('2026-07-19T12:00:00Z');

    beforeEach(async () => {
      procedures = new InMemoryProcedureRepository();
      curativo = Procedure.create({
        name: 'Curativo',
        priceCents: 15000,
        durationMinutes: 60,
      });
      await procedures.save(curativo);
    });

    const list = async (date: string) =>
      new ListAvailableSlots(
        patients,
        appointments,
        procedures,
        scheduleConfig,
        availability,
      ).execute({
        patientId: await portalPatientId(patients, 'maria@example.com'),
        procedureId: curativo.id,
        date,
        now,
      });

    it('Dado feriado, Quando listar, Então nenhum horário', async () => {
      await availability.saveClosure(
        createScheduleClosure({ startsOn: '2026-07-20', reason: 'Feriado' }),
      );
      expect(await list('2026-07-20')).toEqual([]);
    });

    it('Dado pausa 12:00–13:00, Quando listar, Então o horário das 12h some e os vizinhos ficam', async () => {
      await scheduleConfig.save({
        weekdays: [1, 2, 3, 4, 5],
        startHour: 8,
        endHour: 18,
        minGapMinutes: 15,
        lunchBreak: { startMinute: 720, endMinute: 780 },
      });
      const starts = (await list('2026-07-20')).map((s) =>
        s.startsAt.toISOString(),
      );
      expect(starts).not.toContain('2026-07-20T12:00:00.000Z');
      expect(starts).toContain('2026-07-20T11:00:00.000Z');
      expect(starts).toContain('2026-07-20T13:00:00.000Z');
      expect(starts).toHaveLength(9);
    });

    it('Dado listagem do dia, Então lê os bloqueios uma vez só (não por candidato)', async () => {
      const spy = vi.spyOn(availability, 'listClosures');
      await list('2026-07-20');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Dado remarcação de consulta da Dra. Ana, Quando listar, Então respeita o horário dela (lido uma vez)', async () => {
      const appointment = await schedule(
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
        ana.id,
      );
      await availability.replaceProfessionalHours(ana.id, [
        { weekday: 2, startMinute: 840, endMinute: 1020 },
      ]);
      const spy = vi.spyOn(availability, 'getProfessionalHours');

      const slots = await new ListAvailableSlots(
        patients,
        appointments,
        procedures,
        scheduleConfig,
        availability,
      ).execute({
        patientId: await portalPatientId(patients, 'maria@example.com'),
        appointmentId: appointment.id,
        date: '2026-07-21',
        now,
      });

      expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
        '2026-07-21T14:00:00.000Z',
        '2026-07-21T15:00:00.000Z',
        '2026-07-21T16:00:00.000Z',
      ]);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cadastro de bloqueios e horários', () => {
    const create = new (class {
      run(input: Parameters<CreateScheduleClosure['execute']>[0]) {
        return new CreateScheduleClosure(
          availability,
          professionals,
          appointments,
        ).execute(input);
      }
    })();

    it('Dado consultas ativas no período, Quando bloquear a clínica, Então devolve as afetadas (canceladas ficam de fora) e não cancela nada', async () => {
      const kept = await schedule(
        '2026-07-21T09:00:00Z',
        '2026-07-21T10:00:00Z',
      );
      const cancelled = await schedule(
        '2026-07-21T14:00:00Z',
        '2026-07-21T15:00:00Z',
      );
      await appointments.save(cancelled.cancel());
      await schedule('2026-07-23T09:00:00Z', '2026-07-23T10:00:00Z');

      const { closure, affectedAppointments } = await create.run({
        startsOn: '2026-07-21',
        endsOn: '2026-07-22',
        reason: 'Recesso',
      });

      expect(affectedAppointments.map((a) => a.id)).toEqual([kept.id]);
      expect((await appointments.findById(kept.id))?.status).toBe('scheduled');
      expect(await availability.findClosureById(closure.id)).toEqual(closure);
    });

    it('Dado ausência da Dra. Ana, Quando bloquear, Então só as consultas dela são afetadas', async () => {
      const hers = await schedule(
        '2026-07-21T09:00:00Z',
        '2026-07-21T10:00:00Z',
        ana.id,
      );
      await schedule('2026-07-21T14:00:00Z', '2026-07-21T15:00:00Z');

      const { affectedAppointments } = await create.run({
        professionalId: ana.id,
        startsOn: '2026-07-21',
        reason: 'Férias',
      });

      expect(affectedAppointments.map((a) => a.id)).toEqual([hers.id]);
    });

    it('Dado profissional de outra clínica/inexistente, Quando bloquear, Então NotFound e nada é salvo', async () => {
      await expect(
        create.run({
          professionalId: 'nao-existe',
          startsOn: '2026-07-21',
          reason: 'Férias',
        }),
      ).rejects.toThrow(NotFoundError);
      expect(
        await availability.listClosures({
          from: '2026-01-01',
          to: '2026-12-31',
        }),
      ).toEqual([]);
    });

    it('Dado bloqueio existente, Quando remover, Então some; inexistente, NotFound', async () => {
      const { closure } = await create.run({
        startsOn: '2026-07-21',
        reason: 'Recesso',
      });
      const remove = new DeleteScheduleClosure(availability);

      expect((await remove.execute(closure.id)).id).toBe(closure.id);
      expect(await availability.findClosureById(closure.id)).toBeNull();
      await expect(remove.execute(closure.id)).rejects.toThrow(NotFoundError);
    });

    it('Dado janelas válidas, Quando salvar horário, Então grava ordenado; profissional inexistente dá NotFound', async () => {
      const set = new SetProfessionalHours(availability, professionals);
      const saved = await set.execute(ana.id, [
        { weekday: 5, startMinute: 480, endMinute: 720 },
        { weekday: 1, startMinute: 480, endMinute: 720 },
      ]);
      expect(saved.map((w) => w.weekday)).toEqual([1, 5]);
      expect(await availability.getProfessionalHours(ana.id)).toEqual(saved);

      await expect(set.execute('nao-existe', [])).rejects.toThrow(
        NotFoundError,
      );
    });

    it('Dado janelas sobrepostas, Quando salvar, Então ValidationError e o horário anterior fica', async () => {
      const set = new SetProfessionalHours(availability, professionals);
      await set.execute(ana.id, [
        { weekday: 1, startMinute: 480, endMinute: 720 },
      ]);

      await expect(
        set.execute(ana.id, [
          { weekday: 2, startMinute: 480, endMinute: 720 },
          { weekday: 2, startMinute: 600, endMinute: 900 },
        ]),
      ).rejects.toThrow(ValidationError);
      expect(await availability.getProfessionalHours(ana.id)).toEqual([
        { weekday: 1, startMinute: 480, endMinute: 720 },
      ]);
    });
  });
});
