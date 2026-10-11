import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { ScheduleRecurringAppointments } from '@/application/appointments/schedule-recurring-appointments';
import { CreatePatient } from '@/application/patients/create-patient';
import { CreateScheduleClosure } from '@/application/scheduling/schedule-availability';
import type { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryScheduleAvailabilityRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryProfessionalRepository } from '@/infrastructure/persistence/in-memory/in-memory-professional-repository';

// 2026-07-20 é segunda-feira; horários em UTC (testes rodam com TZ=UTC).
describe('Feature: Profissional da consulta existe na empresa e está ativo (issue #219)', () => {
  let patients: InMemoryPatientRepository;
  let appointments: InMemoryAppointmentRepository;
  let professionals: InMemoryProfessionalRepository;
  let maria: Patient;
  let ana: Professional;
  let inativa: Professional;

  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    professionals = new InMemoryProfessionalRepository();
    maria = await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    ana = Professional.create({ fullName: 'Enf. Ana Costa' });
    inativa = Professional.create({ fullName: 'Enf. Bia Souza' }).deactivate();
    await professionals.save(ana);
    await professionals.save(inativa);
  });

  const storedAppointments = () =>
    appointments.findInRange(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2027-01-01T00:00:00Z'),
    );

  const scheduler = () =>
    new ScheduleAppointment(
      appointments,
      patients,
      undefined,
      undefined,
      professionals,
    );

  const input = (professionalId: string | null) => ({
    patientId: maria.id,
    startsAt: new Date('2026-07-20T09:00:00Z'),
    endsAt: new Date('2026-07-20T10:00:00Z'),
    procedure: 'Troca de bolsa',
    priceCents: 25000,
    professionalId,
  });

  describe('Consulta avulsa', () => {
    it('Dado profissional ativo da empresa, Quando agendar, Então salva com ele', async () => {
      const appointment = await scheduler().execute(input(ana.id));
      expect(
        (await appointments.findById(appointment.id))?.professionalId,
      ).toBe(ana.id);
    });

    it('Dado consulta sem profissional, Quando agendar, Então continua válida', async () => {
      const appointment = await scheduler().execute(input(null));
      expect(appointment.professionalId).toBeNull();
    });

    it('Dado profissional de outra empresa (fora do repositório com escopo), Quando agendar, Então NotFound e nada é salvo', async () => {
      await expect(
        scheduler().execute(input('prof-de-outra-empresa')),
      ).rejects.toThrow(NotFoundError);
      expect(await storedAppointments()).toEqual([]);
    });

    it('Dado profissional inativo, Quando agendar, Então ValidationError e nada é salvo', async () => {
      await expect(scheduler().execute(input(inativa.id))).rejects.toThrow(
        ValidationError,
      );
      expect(await storedAppointments()).toEqual([]);
    });
  });

  describe('Série recorrente', () => {
    const recurring = (professionalId: string) =>
      new ScheduleRecurringAppointments(scheduler()).execute({
        ...input(professionalId),
        occurrences: 3,
      });

    it('Dado profissional inativo, Quando agendar a série, Então falha inteira (não vira ocorrências puladas)', async () => {
      await expect(recurring(inativa.id)).rejects.toThrow(ValidationError);
      expect(await storedAppointments()).toEqual([]);
    });

    it('Dado profissional de outra empresa, Quando agendar a série, Então NotFound', async () => {
      await expect(recurring('prof-de-outra-empresa')).rejects.toThrow(
        NotFoundError,
      );
      expect(await storedAppointments()).toEqual([]);
    });

    it('Dado profissional ativo, Quando agendar a série, Então cria todas', async () => {
      const result = await recurring(ana.id);
      expect(result.created).toHaveLength(3);
      expect(result.skipped).toEqual([]);
    });
  });

  describe('Ausência (bloqueio de agenda)', () => {
    it('Dado profissional inativo, Quando registrar ausência, Então ValidationError e nada é salvo', async () => {
      const availability = new InMemoryScheduleAvailabilityRepository();
      await expect(
        new CreateScheduleClosure(
          availability,
          professionals,
          appointments,
        ).execute(
          {
            professionalId: inativa.id,
            startsOn: '2026-07-21',
            reason: 'Férias',
          },
          null,
        ),
      ).rejects.toThrow(ValidationError);
      expect(
        await availability.listClosures({
          from: '2026-01-01',
          to: '2026-12-31',
        }),
      ).toEqual([]);
    });
  });
});
