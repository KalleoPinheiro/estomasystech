import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreatePatient } from '@/application/patients/create-patient';
import { ConfirmOwnAppointment } from '@/application/portal/confirm-own-appointment';
import type { Patient } from '@/domain/patient/patient';
import type { Appointment } from '@/domain/scheduling/appointment';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { portalPatientId } from '../support/portal-identity';

// 2026-07-20 é segunda-feira; horários em UTC (testes rodam com TZ=UTC).
describe('Feature: Confirmação de presença pelo próprio paciente (portal)', () => {
  let patientRepo: InMemoryPatientRepository;
  let appointmentRepo: InMemoryAppointmentRepository;
  let maria: Patient;
  let appointment: Appointment;
  const now = new Date('2026-07-19T12:00:00Z');

  beforeEach(async () => {
    patientRepo = new InMemoryPatientRepository();
    appointmentRepo = new InMemoryAppointmentRepository();
    maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    appointment = await new ScheduleAppointment(
      appointmentRepo,
      patientRepo,
    ).execute({
      patientId: maria.id,
      startsAt: new Date('2026-07-20T09:00:00Z'),
      endsAt: new Date('2026-07-20T10:00:00Z'),
      procedure: 'Troca de bolsa',
      priceCents: 25000,
    });
  });

  const confirm = async (email: string, appointmentId: string) =>
    new ConfirmOwnAppointment(patientRepo, appointmentRepo).execute({
      patientId: await portalPatientId(patientRepo, email),
      appointmentId,
      now,
    });

  it('Dado consulta futura agendada, Quando o paciente confirma, Então status vira confirmed', async () => {
    const result = await confirm('maria@example.com', appointment.id);

    expect(result.status).toBe('confirmed');
    const stored = await appointmentRepo.findById(appointment.id);
    expect(stored?.status).toBe('confirmed');
  });

  it('Dado consulta já confirmada, Quando confirmar de novo, Então retorna estado atual sem erro', async () => {
    await confirm('maria@example.com', appointment.id);

    const result = await confirm('maria@example.com', appointment.id);
    expect(result.status).toBe('confirmed');
  });

  it('Dado consulta de outro paciente, Quando confirmar, Então NotFound (não vaza existência)', async () => {
    await new CreatePatient(patientRepo).execute({
      fullName: 'João Souza',
      email: 'joao@example.com',
      phone: '11888880000',
    });

    await expect(confirm('joao@example.com', appointment.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('Dado consulta no passado, Quando confirmar, Então ValidationError', async () => {
    await expect(
      new ConfirmOwnAppointment(patientRepo, appointmentRepo).execute({
        patientId: maria.id,
        appointmentId: appointment.id,
        now: new Date('2026-07-20T09:30:00Z'),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('Dado paciente inexistente, Quando confirmar, Então NotFound', async () => {
    await expect(confirm('ghost@example.com', appointment.id)).rejects.toThrow(
      NotFoundError,
    );
  });
});
