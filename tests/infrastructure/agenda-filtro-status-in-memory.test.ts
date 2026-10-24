import { describe, expect, it } from 'vitest';
import { CountAppointmentsByStatus } from '@/application/appointments/count-appointments-by-status';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';

const build = (
  hour: string,
  professionalId: string | null,
  prepare: (a: Appointment) => Appointment = (a) => a,
) =>
  prepare(
    Appointment.create({
      patientId: 'p1',
      slot: TimeSlot.create(
        new Date(`2027-09-01T${hour}:00:00Z`),
        new Date(`2027-09-01T${hour}:45:00Z`),
      ),
      procedure: 'Curativo',
      price: Money.fromCents(10000),
      professionalId,
    }),
  );

const FROM = new Date('2027-09-01T00:00:00Z');
const TO = new Date('2027-09-02T00:00:00Z');

describe('Feature: Filtro de status no repositório em memória (#538)', () => {
  const seed = async () => {
    const repo = new InMemoryAppointmentRepository();
    await repo.save(build('09', 'ana'));
    await repo.save(build('10', 'ana', (a) => a.confirm()));
    await repo.save(build('11', 'bruno', (a) => a.confirm()));
    await repo.save(build('12', 'bruno', (a) => a.cancel()));
    return repo;
  };

  it('Dado status confirmed, Quando findInRange, Então só as confirmadas', async () => {
    const repo = await seed();
    const found = await repo.findInRange(FROM, TO, {
      statuses: ['confirmed'],
    });
    expect(found.map((a) => a.status)).toEqual(['confirmed', 'confirmed']);
  });

  it('Dado lista de status vazia, Quando findInRange, Então nenhuma', async () => {
    const repo = await seed();
    expect(await repo.findInRange(FROM, TO, { statuses: [] })).toEqual([]);
  });

  it('Dado profissional e status, Quando findInRange, Então combina os dois filtros', async () => {
    const repo = await seed();
    const found = await repo.findInRange(FROM, TO, {
      professionalId: 'ana',
      statuses: ['confirmed'],
    });
    expect(found).toHaveLength(1);
  });

  it('Dado o período, Quando contar por status, Então conta todos, sem filtro de status', async () => {
    const repo = await seed();
    expect(
      await new CountAppointmentsByStatus(repo).execute({ from: FROM, to: TO }),
    ).toEqual({
      scheduled: 1,
      confirmed: 2,
      completed: 0,
      cancelled: 1,
      no_show: 0,
    });
    expect(
      (
        await new CountAppointmentsByStatus(repo).execute({
          from: FROM,
          to: TO,
          professionalId: 'bruno',
        })
      ).confirmed,
    ).toBe(1);
  });
});
