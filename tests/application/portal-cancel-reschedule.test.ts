import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreatePatient } from '@/application/patients/create-patient';
import { CancelOwnAppointment } from '@/application/portal/cancel-own-appointment';
import { ListAvailableSlots } from '@/application/portal/list-available-slots';
import { RescheduleOwnAppointment } from '@/application/portal/reschedule-own-appointment';
import type { Patient } from '@/domain/patient/patient';
import type { Appointment } from '@/domain/scheduling/appointment';
import {
  canPatientChange,
  PATIENT_CHANGE_MIN_NOTICE_HOURS,
  patientChangeDeadline,
} from '@/domain/scheduling/patient-self-service';
import {
  NotFoundError,
  SchedulingConflictError,
  ValidationError,
} from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryProcedureRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { portalPatientId } from '../support/portal-identity';

// 2026-07-20 = segunda. Testes rodam com TZ=UTC; grade padrão 8h–18h.
describe('Feature: Paciente cancela e remarca a própria consulta (portal)', () => {
  let patientRepo: InMemoryPatientRepository;
  let appointmentRepo: InMemoryAppointmentRepository;
  let maria: Patient;
  let appointment: Appointment;
  // Consulta às 09:00 de segunda; prazo do portal: 09:00 de domingo.
  const beforeDeadline = new Date('2026-07-19T09:00:00Z');
  const afterDeadline = new Date('2026-07-19T09:00:01Z');

  const schedule = (startsAt: string, endsAt: string, patientId = maria.id) =>
    new ScheduleAppointment(appointmentRepo, patientRepo).execute({
      patientId,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      procedure: 'Curativo',
      priceCents: 15000,
    });

  beforeEach(async () => {
    patientRepo = new InMemoryPatientRepository();
    appointmentRepo = new InMemoryAppointmentRepository();
    maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    await new CreatePatient(patientRepo).execute({
      fullName: 'João Souza',
      email: 'joao@example.com',
      phone: '11988880000',
    });
    appointment = await schedule(
      '2026-07-20T09:00:00Z',
      '2026-07-20T09:45:00Z',
    );
  });

  const cancel = async (
    now: Date,
    email = 'maria@example.com',
    reason?: string,
  ) =>
    new CancelOwnAppointment(patientRepo, appointmentRepo).execute({
      patientId: await portalPatientId(patientRepo, email),
      appointmentId: appointment.id,
      reason,
      now,
    });

  const reschedule = async (
    startsAt: string,
    now = beforeDeadline,
    email = 'maria@example.com',
  ) =>
    new RescheduleOwnAppointment(patientRepo, appointmentRepo).execute({
      patientId: await portalPatientId(patientRepo, email),
      appointmentId: appointment.id,
      startsAt: new Date(startsAt),
      now,
    });

  describe('Regra de antecedência', () => {
    it(`Dado consulta, Então o prazo do paciente é ${PATIENT_CHANGE_MIN_NOTICE_HOURS}h antes do início`, () => {
      expect(
        patientChangeDeadline(new Date('2026-07-20T09:00:00Z')).toISOString(),
      ).toBe('2026-07-19T09:00:00.000Z');
    });

    it('Dado exatamente no prazo, Então ainda pode mudar; um segundo depois, não', () => {
      expect(canPatientChange(appointment, beforeDeadline)).toBe(true);
      expect(canPatientChange(appointment, afterDeadline)).toBe(false);
    });

    it('Dado consulta concluída ou cancelada, Então não pode mudar', () => {
      expect(canPatientChange(appointment.complete(), beforeDeadline)).toBe(
        false,
      );
      expect(canPatientChange(appointment.cancel(), beforeDeadline)).toBe(
        false,
      );
    });
  });

  describe('Cancelar', () => {
    it('Dado consulta própria no prazo, Quando cancelar, Então fica cancelada pelo paciente com data e motivo', async () => {
      const { appointment: result, changed } = await cancel(
        beforeDeadline,
        'maria@example.com',
        '  Viagem  ',
      );

      expect(changed).toBe(true);
      expect(result.status).toBe('cancelled');
      expect(result.cancellation).toEqual({
        by: 'patient',
        at: beforeDeadline,
        reason: 'Viagem',
        late: false,
      });
      expect((await appointmentRepo.findById(appointment.id))?.status).toBe(
        'cancelled',
      );
    });

    it('Dado consulta confirmada, Quando cancelar no prazo, Então cancela', async () => {
      await appointmentRepo.save(appointment.confirm());
      const { appointment: result } = await cancel(beforeDeadline);
      expect(result.status).toBe('cancelled');
    });

    it('Dado menos de 24h para a consulta, Quando cancelar, Então ValidationError orientando a falar com a clínica', async () => {
      await expect(cancel(afterDeadline)).rejects.toThrow(/fale com a clínica/);
      expect((await appointmentRepo.findById(appointment.id))?.status).toBe(
        'scheduled',
      );
    });

    it('Dado já cancelada pelo paciente, Quando cancelar de novo (mesmo fora do prazo), Então devolve sem mudar', async () => {
      await cancel(beforeDeadline, 'maria@example.com', 'Primeiro');

      const again = await cancel(afterDeadline, 'maria@example.com', 'Outro');

      expect(again.changed).toBe(false);
      expect(again.appointment.cancellation?.reason).toBe('Primeiro');
    });

    it('Dado cancelada pela clínica, Quando o paciente cancelar, Então ValidationError', async () => {
      await appointmentRepo.save(appointment.cancel());
      await expect(cancel(beforeDeadline)).rejects.toThrow(ValidationError);
    });

    it('Dado consulta de outro paciente, Quando cancelar, Então NotFound', async () => {
      await expect(cancel(beforeDeadline, 'joao@example.com')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('Dado paciente inativo, Quando cancelar, Então NotFound', async () => {
      await patientRepo.save(maria.deactivate());
      await expect(cancel(beforeDeadline)).rejects.toThrow(NotFoundError);
    });
  });

  describe('Remarcar', () => {
    it('Dado horário livre, Quando remarcar no prazo, Então muda o horário com a mesma duração', async () => {
      const result = await reschedule('2026-07-21T14:00:00Z');

      expect(result.slot.start.toISOString()).toBe('2026-07-21T14:00:00.000Z');
      expect(result.slot.end.toISOString()).toBe('2026-07-21T14:45:00.000Z');
      expect(result.procedure).toBe('Curativo');
      expect(result.price.cents).toBe(15000);
    });

    it('Dado consulta confirmada, Quando remarcar, Então volta a aguardar confirmação', async () => {
      await appointmentRepo.save(appointment.confirm());
      const result = await reschedule('2026-07-21T14:00:00Z');
      expect(result.status).toBe('scheduled');
    });

    it('Dado menos de 24h para a consulta, Quando remarcar, Então ValidationError', async () => {
      await expect(
        reschedule('2026-07-21T14:00:00Z', afterDeadline),
      ).rejects.toThrow(/fale com a clínica/);
    });

    it('Dado novo horário no passado, Quando remarcar, Então ValidationError', async () => {
      await expect(reschedule('2026-07-17T10:00:00Z')).rejects.toThrow(
        'Escolha um horário futuro para a consulta',
      );
    });

    it('Dado horário ocupado por outra consulta, Quando remarcar, Então SchedulingConflictError', async () => {
      const joao = (await patientRepo.findAll('joao@example.com'))[0];
      await schedule(
        '2026-07-21T14:00:00Z',
        '2026-07-21T15:00:00Z',
        joao?.id as string,
      );
      await expect(reschedule('2026-07-21T14:00:00Z')).rejects.toThrow(
        SchedulingConflictError,
      );
    });

    it('Dado o próprio horário deslocado em 30 minutos, Quando remarcar, Então a consulta não conflita consigo mesma', async () => {
      const result = await reschedule('2026-07-20T09:30:00Z');
      expect(result.slot.start.toISOString()).toBe('2026-07-20T09:30:00.000Z');
    });

    it('Dado consulta de outro paciente, Quando remarcar, Então NotFound', async () => {
      await expect(
        reschedule('2026-07-21T14:00:00Z', beforeDeadline, 'joao@example.com'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Horários para remarcar', () => {
    const list = async (date: string, email = 'maria@example.com') =>
      new ListAvailableSlots(
        patientRepo,
        appointmentRepo,
        new InMemoryProcedureRepository(),
      ).execute({
        patientId: await portalPatientId(patientRepo, email),
        appointmentId: appointment.id,
        date,
        now: beforeDeadline,
      });

    it('Dado remarcação, Quando listar, Então usa a duração da consulta e ignora o próprio horário como conflito', async () => {
      const slots = await list('2026-07-20');

      // 45 min de passo, de 08:00 até o último que termina às 18:00.
      expect(slots[0].startsAt.toISOString()).toBe('2026-07-20T08:00:00.000Z');
      expect(slots[0].endsAt.toISOString()).toBe('2026-07-20T08:45:00.000Z');
      expect(slots.map((slot) => slot.startsAt.toISOString())).toContain(
        '2026-07-20T09:30:00.000Z',
      );
      expect(slots).toHaveLength(13);
    });

    it('Dado consulta de outro paciente, Quando listar, Então NotFound', async () => {
      await expect(list('2026-07-20', 'joao@example.com')).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
