import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePatient } from '@/application/patients/create-patient';
import {
  ListAvailableSlots,
  memoizeAvailability,
} from '@/application/portal/list-available-slots';
import { Procedure } from '@/domain/catalog/procedure';
import { createScheduleClosure } from '@/domain/scheduling/schedule-availability';
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

describe('Feature: Horários livres do autoagendamento nas bordas (PORT4-01)', () => {
  let patients: InMemoryPatientRepository;
  let appointments: InMemoryAppointmentRepository;
  let availability: InMemoryScheduleAvailabilityRepository;
  let procedure: Procedure;
  let useCase: ListAvailableSlots;
  let patientId: string;

  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    availability = new InMemoryScheduleAvailabilityRepository();
    const procedures = new InMemoryProcedureRepository();
    await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    patientId = await portalPatientId(patients, 'maria@example.com');
    procedure = Procedure.create({
      name: 'Curativo',
      priceCents: 15000,
      durationMinutes: 45,
    });
    await procedures.save(procedure);
    useCase = new ListAvailableSlots(
      patients,
      appointments,
      procedures,
      new InMemoryScheduleConfigRepository(),
      availability,
    );
  });

  it('Dado dia inexistente no calendário (31 de fevereiro), Quando listar, Então não oferta nenhum horário', async () => {
    const slots = await useCase.execute({
      patientId,
      procedureId: procedure.id,
      date: '2026-02-31',
      now: new Date('2026-02-01T12:00:00Z'),
    });
    expect(slots).toEqual([]);
  });

  it('Dado hoje depois do fim do expediente, Quando listar, Então não sobra horário para ofertar', async () => {
    const slots = await useCase.execute({
      patientId,
      procedureId: procedure.id,
      date: DAY,
      now: new Date('2026-07-20T23:00:00Z'),
    });
    expect(slots).toEqual([]);
  });

  it('Dado falha de infraestrutura ao ler a agenda, Quando listar, Então propaga o erro em vez de esconder horários', async () => {
    vi.spyOn(appointments, 'findConflicting').mockRejectedValue(
      new Error('banco indisponível'),
    );
    await expect(
      useCase.execute({
        patientId,
        procedureId: procedure.id,
        date: DAY,
        now: new Date('2026-07-19T12:00:00Z'),
      }),
    ).rejects.toThrow('banco indisponível');
  });
  it('Dado falha ao ler os bloqueios da agenda, Quando listar, Então propaga o erro em vez de esconder horários', async () => {
    vi.spyOn(availability, 'listClosures').mockRejectedValue(
      new Error('bloqueios indisponíveis'),
    );
    await expect(
      useCase.execute({
        patientId,
        procedureId: procedure.id,
        date: DAY,
        now: new Date('2026-07-19T12:00:00Z'),
      }),
    ).rejects.toThrow('bloqueios indisponíveis');
  });
});

describe('Feature: Leitura de disponibilidade em cache durante a listagem (#360)', () => {
  it('Dado leituras repetidas, Quando consultar a fonte, Então lê uma vez só; escritas seguem direto para a fonte', async () => {
    const source = new InMemoryScheduleAvailabilityRepository();
    const listSpy = vi.spyOn(source, 'listClosures');
    const hoursSpy = vi.spyOn(source, 'getProfessionalHours');
    const cached = memoizeAvailability(source);

    const range = { from: '2026-07-01', to: '2026-07-31' };
    await cached.listClosures(range);
    await cached.listClosures(range);
    await cached.getProfessionalHours('pro-a');
    await cached.getProfessionalHours('pro-a');
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(hoursSpy).toHaveBeenCalledTimes(1);

    const closure = createScheduleClosure({
      startsOn: '2026-07-21',
      reason: 'Recesso',
    });
    await cached.saveClosure(closure);
    expect((await source.findClosureById(closure.id))?.id).toBe(closure.id);
    expect((await cached.findClosureById(closure.id))?.id).toBe(closure.id);

    await cached.replaceProfessionalHours('pro-a', [
      { weekday: 1, startMinute: 480, endMinute: 720 },
    ]);
    expect(await source.getProfessionalHours('pro-a')).toHaveLength(1);

    await cached.deleteClosure(closure.id);
    expect(await source.findClosureById(closure.id)).toBeNull();
  });
});
