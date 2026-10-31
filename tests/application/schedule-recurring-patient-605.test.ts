import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { ScheduleRecurringAppointments } from '@/application/appointments/schedule-recurring-appointments';
import { CreatePatient } from '@/application/patients/create-patient';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

/**
 * #605: a série semanal confere o paciente ANTES de agendar. Antes, paciente
 * inexistente (ou de outra empresa, que o repositório escopado não enxerga)
 * virava N sessões «puladas» e a ação seguia como sucesso, auditando um id alheio.
 */
describe('Feature: Série semanal exige paciente da empresa (#605)', () => {
  let patients: InMemoryPatientRepository;
  let appointments: InMemoryAppointmentRepository;
  let maria: Awaited<ReturnType<CreatePatient['execute']>>;

  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    maria = await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
  });

  const series = (patientId: string) =>
    new ScheduleRecurringAppointments(
      new ScheduleAppointment(appointments, patients),
    ).execute({
      patientId,
      startsAt: new Date('2026-07-20T09:00:00Z'),
      endsAt: new Date('2026-07-20T10:00:00Z'),
      procedure: 'Troca de bolsa',
      priceCents: 25000,
      occurrences: 3,
    });

  const stored = () =>
    appointments.findInRange(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2027-01-01T00:00:00Z'),
    );

  it('Dado paciente inexistente na empresa, Quando agenda a série, Então falha com NotFoundError e nada é criado', async () => {
    await expect(series('nao-existe')).rejects.toBeInstanceOf(NotFoundError);
    expect(await stored()).toHaveLength(0);
  });

  it('Dado paciente inativo, Quando agenda a série, Então falha com ValidationError em vez de pular tudo', async () => {
    await patients.save(maria.deactivate());

    await expect(series(maria.id)).rejects.toBeInstanceOf(ValidationError);
    expect(await stored()).toHaveLength(0);
  });

  it('Dado paciente válido, Quando agenda a série, Então cria as sessões', async () => {
    const result = await series(maria.id);

    expect(result.created).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
  });

  it('Dado paciente válido com a série toda em conflito, Quando agenda, Então segue como sucesso com tudo pulado', async () => {
    await series(maria.id);

    const again = await series(maria.id);

    expect(again.created).toHaveLength(0);
    expect(again.skipped).toHaveLength(3);
  });
});
