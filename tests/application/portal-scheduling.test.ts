import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreatePatient } from '@/application/patients/create-patient';
import { ListAvailableSlots } from '@/application/portal/list-available-slots';
import { ScheduleOwnAppointment } from '@/application/portal/schedule-own-appointment';
import { Procedure } from '@/domain/catalog/procedure';
import { FollowUp } from '@/domain/followup/follow-up';
import type { Patient } from '@/domain/patient/patient';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryProcedureRepository,
  InMemoryScheduleConfigRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { portalPatientId } from '../support/portal-identity';
import { noTransaction } from '../support/transaction-scope';

// 2026-07-20 = segunda; 2026-07-25 = sábado. Testes rodam com TZ=UTC.
describe('Feature: Horários disponíveis para o paciente agendar (PORT4-01..03)', () => {
  let patientRepo: InMemoryPatientRepository;
  let appointmentRepo: InMemoryAppointmentRepository;
  let procedureRepo: InMemoryProcedureRepository;
  let maria: Patient;
  let curativo: Procedure;
  const now = new Date('2026-07-19T12:00:00Z');

  beforeEach(async () => {
    patientRepo = new InMemoryPatientRepository();
    appointmentRepo = new InMemoryAppointmentRepository();
    procedureRepo = new InMemoryProcedureRepository();
    maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    // 60 min → slots de hora em hora entre 08:00 e 18:00 (grade padrão).
    curativo = Procedure.create({
      name: 'Curativo',
      priceCents: 15000,
      durationMinutes: 60,
    });
    await procedureRepo.save(curativo);
  });

  const listSlots = async (
    date: string,
    email = 'maria@example.com',
    procedureId = curativo.id,
  ) =>
    new ListAvailableSlots(patientRepo, appointmentRepo, procedureRepo).execute(
      {
        patientId: await portalPatientId(patientRepo, email),
        procedureId,
        date,
        now,
      },
    );

  it('Dado dia útil livre, Quando listar, Então oferta slots da grade do primeiro ao último horário', async () => {
    const slots = await listSlots('2026-07-20');

    expect(slots).toHaveLength(10);
    expect(slots[0].startsAt.toISOString()).toBe('2026-07-20T08:00:00.000Z');
    expect(slots[0].endsAt.toISOString()).toBe('2026-07-20T09:00:00.000Z');
    expect(slots[slots.length - 1].startsAt.toISOString()).toBe(
      '2026-07-20T17:00:00.000Z',
    );
    expect(slots[slots.length - 1].endsAt.toISOString()).toBe(
      '2026-07-20T18:00:00.000Z',
    );
  });

  it('Dado consulta existente, Quando listar, Então o horário ocupado e o vizinho sem folga somem (PORT4-01)', async () => {
    await new ScheduleAppointment(appointmentRepo, patientRepo).execute({
      patientId: maria.id,
      startsAt: new Date('2026-07-20T10:00:00Z'),
      endsAt: new Date('2026-07-20T11:00:00Z'),
      procedure: 'Troca de bolsa',
      priceCents: 25000,
    });

    const starts = (await listSlots('2026-07-20')).map((s) =>
      s.startsAt.toISOString(),
    );

    // 10:00 ocupado; 09:00 e 11:00 encostam sem a folga mínima de 15 min.
    expect(starts).not.toContain('2026-07-20T10:00:00.000Z');
    expect(starts).not.toContain('2026-07-20T09:00:00.000Z');
    expect(starts).not.toContain('2026-07-20T11:00:00.000Z');
    expect(starts).toContain('2026-07-20T08:00:00.000Z');
    expect(starts).toContain('2026-07-20T12:00:00.000Z');
  });

  it('Dado grade configurada pela clínica, Quando listar, Então o portal segue a configuração (PORT4-01)', async () => {
    const scheduleConfig = new InMemoryScheduleConfigRepository();
    // Sábado ativo, 10h–12h: nada disso vem do default.
    await scheduleConfig.save({
      weekdays: [1, 2, 3, 4, 5, 6],
      startHour: 10,
      endHour: 12,
      minGapMinutes: 15,
    });

    const slots = await new ListAvailableSlots(
      patientRepo,
      appointmentRepo,
      procedureRepo,
      scheduleConfig,
    ).execute({
      patientId: await portalPatientId(patientRepo, 'maria@example.com'),
      procedureId: curativo.id,
      date: '2026-07-25', // sábado
      now,
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      '2026-07-25T10:00:00.000Z',
      '2026-07-25T11:00:00.000Z',
    ]);
  });

  it('Dado sábado (fora da grade), Quando listar, Então lista vazia (PORT4-02)', async () => {
    expect(await listSlots('2026-07-25')).toEqual([]);
  });

  it('Dado data em formato inválido, Quando listar, Então lista vazia', async () => {
    expect(await listSlots('25/07/2026')).toEqual([]);
  });

  it('Dado procedimento inativo, Quando listar, Então NotFoundError (PORT4-03)', async () => {
    const inativo = Procedure.create({
      name: 'Descontinuado',
      priceCents: 1000,
      durationMinutes: 30,
    });
    await procedureRepo.save(inativo.deactivate());

    await expect(
      listSlots('2026-07-20', 'maria@example.com', inativo.id),
    ).rejects.toThrow(NotFoundError);
  });

  it('Dado procedimento inexistente, Quando listar, Então NotFoundError (PORT4-03)', async () => {
    await expect(
      listSlots('2026-07-20', 'maria@example.com', 'nao-existe'),
    ).rejects.toThrow(NotFoundError);
  });

  it('Dado email sem paciente ativo, Quando listar, Então NotFoundError (escopo da sessão)', async () => {
    await expect(
      listSlots('2026-07-20', 'estranho@example.com'),
    ).rejects.toThrow(NotFoundError);

    await patientRepo.save(maria.deactivate());
    await expect(listSlots('2026-07-20')).rejects.toThrow(NotFoundError);
  });

  it('Dado dia corrente com horários já passados, Quando listar, Então só oferta o futuro (edge case)', async () => {
    const slots = await new ListAvailableSlots(
      patientRepo,
      appointmentRepo,
      procedureRepo,
    ).execute({
      patientId: await portalPatientId(patientRepo, 'maria@example.com'),
      procedureId: curativo.id,
      date: '2026-07-20',
      now: new Date('2026-07-20T13:30:00Z'),
    });

    expect(slots[0].startsAt.toISOString()).toBe('2026-07-20T14:00:00.000Z');
    expect(slots.map((s) => s.startsAt.toISOString())).not.toContain(
      '2026-07-20T08:00:00.000Z',
    );
  });

  it('Dado procedimento de 30 min, Quando listar, Então o passo acompanha a duração do catálogo', async () => {
    const rapido = Procedure.create({
      name: 'Avaliação rápida',
      priceCents: 8000,
      durationMinutes: 30,
    });
    await procedureRepo.save(rapido);

    const slots = await listSlots('2026-07-20', 'maria@example.com', rapido.id);

    expect(slots).toHaveLength(20);
    expect(slots[1].startsAt.toISOString()).toBe('2026-07-20T08:30:00.000Z');
  });
});

describe('Feature: Paciente agenda o próprio retorno (PORT4-04..07)', () => {
  let patientRepo: InMemoryPatientRepository;
  let appointmentRepo: InMemoryAppointmentRepository;
  let procedureRepo: InMemoryProcedureRepository;
  let followUpRepo: InMemoryFollowUpRepository;
  let maria: Patient;
  let curativo: Procedure;

  beforeEach(async () => {
    patientRepo = new InMemoryPatientRepository();
    appointmentRepo = new InMemoryAppointmentRepository();
    procedureRepo = new InMemoryProcedureRepository();
    followUpRepo = new InMemoryFollowUpRepository();
    maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    curativo = Procedure.create({
      name: 'Curativo',
      priceCents: 15000,
      durationMinutes: 60,
    });
    await procedureRepo.save(curativo);
  });

  const schedule = async (
    input: {
      email?: string;
      procedureId?: string;
      startsAt?: string;
      followUpId?: string | null;
    } = {},
  ) =>
    new ScheduleOwnAppointment(
      patientRepo,
      procedureRepo,
      followUpRepo,
      noTransaction({ patients: patientRepo, appointments: appointmentRepo }),
    ).execute({
      patientId: await portalPatientId(
        patientRepo,
        input.email ?? 'maria@example.com',
      ),
      procedureId: input.procedureId ?? curativo.id,
      startsAt: new Date(input.startsAt ?? '2026-07-20T09:00:00Z'),
      followUpId: input.followUpId ?? null,
      // Fixtures vivem em julho/2026; o relógio acompanha para o cenário ser
      // sempre "horário futuro" (a rejeição de passado tem teste próprio).
      now: new Date('2026-07-19T12:00:00Z'),
    });

  it('Dado slot livre, Quando agendar, Então cria consulta do paciente com preço e duração do catálogo (PORT4-04)', async () => {
    const appointment = await schedule();

    expect(appointment.patientId).toBe(maria.id);
    expect(appointment.procedure).toBe('Curativo');
    expect(appointment.price.cents).toBe(15000);
    expect(appointment.procedureId).toBe(curativo.id);
    expect(appointment.slot.end.toISOString()).toBe('2026-07-20T10:00:00.000Z');
    expect(appointment.status).toBe('scheduled');
  });

  it('Dado grade configurada, Quando agendar fora dela pelo portal, Então rejeita (PORT4-04)', async () => {
    const scheduleConfig = new InMemoryScheduleConfigRepository();
    await scheduleConfig.save({
      weekdays: [1, 2, 3, 4, 5],
      startHour: 10,
      endHour: 12,
      minGapMinutes: 15,
    });

    await expect(
      new ScheduleOwnAppointment(
        patientRepo,
        procedureRepo,
        followUpRepo,
        noTransaction({
          patients: patientRepo,
          appointments: appointmentRepo,
          scheduleConfig,
        }),
      ).execute({
        patientId: await portalPatientId(patientRepo, 'maria@example.com'),
        procedureId: curativo.id,
        startsAt: new Date('2026-07-20T09:00:00Z'), // antes da abertura configurada
        now: new Date('2026-07-19T12:00:00Z'),
      }),
    ).rejects.toThrow(ValidationError);

    expect(await appointmentRepo.findByPatientId(maria.id)).toHaveLength(0);
  });

  it('Dado horário no passado, Quando agendar pelo portal, Então rejeita e nada é criado (PORT4-04)', async () => {
    await expect(
      new ScheduleOwnAppointment(
        patientRepo,
        procedureRepo,
        followUpRepo,
        noTransaction({ patients: patientRepo, appointments: appointmentRepo }),
      ).execute({
        patientId: await portalPatientId(patientRepo, 'maria@example.com'),
        procedureId: curativo.id,
        startsAt: new Date('2026-07-20T09:00:00Z'),
        now: new Date('2026-07-20T14:00:00Z'),
      }),
    ).rejects.toThrow(ValidationError);

    expect(await appointmentRepo.findByPatientId(maria.id)).toHaveLength(0);
  });

  it('Dado horário conflitante, Quando agendar, Então erro de conflito e nenhuma consulta nova (PORT4-05)', async () => {
    await schedule();

    await expect(
      schedule({ startsAt: '2026-07-20T09:30:00Z' }),
    ).rejects.toThrow(/Horário indisponível/);
    expect(await appointmentRepo.findByPatientId(maria.id)).toHaveLength(1);
  });

  it('Dado followUpId do próprio paciente, Quando agendar, Então o retorno vira scheduled (PORT4-06)', async () => {
    const followUp = FollowUp.create({
      patientId: maria.id,
      appointmentId: null,
      dueDate: new Date('2026-07-15T00:00:00Z'),
      reason: 'Revisão do curativo',
    });
    await followUpRepo.save(followUp);

    await schedule({ followUpId: followUp.id });

    expect((await followUpRepo.findById(followUp.id))?.status).toBe(
      'scheduled',
    );
  });

  it('Dado followUp de outro paciente, Quando agendar, Então NotFoundError e nada é criado (PORT4-07)', async () => {
    const outro = await new CreatePatient(patientRepo).execute({
      fullName: 'João Outro',
      email: 'joao@example.com',
      phone: '11988887777',
    });
    const alheio = FollowUp.create({
      patientId: outro.id,
      appointmentId: null,
      dueDate: new Date('2026-07-15T00:00:00Z'),
      reason: 'Retorno do João',
    });
    await followUpRepo.save(alheio);

    await expect(schedule({ followUpId: alheio.id })).rejects.toThrow(
      NotFoundError,
    );
    expect(await appointmentRepo.findByPatientId(maria.id)).toHaveLength(0);
    expect((await followUpRepo.findById(alheio.id))?.status).toBe('pending');
  });

  it('Dado conflito com followUp informado, Quando agendar, Então o retorno permanece pendente (edge case)', async () => {
    const followUp = FollowUp.create({
      patientId: maria.id,
      appointmentId: null,
      dueDate: new Date('2026-07-15T00:00:00Z'),
      reason: 'Revisão do curativo',
    });
    await followUpRepo.save(followUp);
    await schedule();

    await expect(
      schedule({ startsAt: '2026-07-20T09:30:00Z', followUpId: followUp.id }),
    ).rejects.toThrow(/Horário indisponível/);
    expect((await followUpRepo.findById(followUp.id))?.status).toBe('pending');
  });

  it('Dado procedimento inativo, Quando agendar, Então NotFoundError', async () => {
    const inativo = Procedure.create({
      name: 'Descontinuado',
      priceCents: 1000,
      durationMinutes: 30,
    });
    await procedureRepo.save(inativo.deactivate());

    await expect(schedule({ procedureId: inativo.id })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('Dado paciente inativo, Quando agendar, Então NotFoundError (escopo da sessão)', async () => {
    await patientRepo.save(maria.deactivate());

    await expect(schedule()).rejects.toThrow(NotFoundError);
  });
});
