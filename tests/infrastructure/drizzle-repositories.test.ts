import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Invoice } from '@/domain/billing/invoice';
import { Procedure } from '@/domain/catalog/procedure';
import { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import { Appointment } from '@/domain/scheduling/appointment';
import { DEFAULT_SCHEDULE_CONFIG } from '@/domain/scheduling/schedule-config';
import { SchedulingConflictError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAppointmentRepository } from '@/infrastructure/persistence/drizzle/drizzle-appointment-repository';
import {
  DrizzleProcedureKitRepository,
  DrizzleProcedureRepository,
  DrizzleScheduleConfigRepository,
  DrizzleUserAccountRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import { DrizzleInvoiceRepository } from '@/infrastructure/persistence/drizzle/drizzle-invoice-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleProducedSessionRepository } from '@/infrastructure/persistence/drizzle/drizzle-produced-session-repository';
import { DrizzleProfessionalRepository } from '@/infrastructure/persistence/drizzle/drizzle-professional-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { encodeCursor } from '@/lib/pagination';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const slot = (startIso: string, endIso: string) =>
  TimeSlot.create(new Date(startIso), new Date(endIso));

describe('Feature: Persistência PostgreSQL (Drizzle)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let patientRepo: DrizzlePatientRepository;
  let appointmentRepo: DrizzleAppointmentRepository;
  let invoiceRepo: DrizzleInvoiceRepository;
  let professionalRepo: DrizzleProfessionalRepository;
  let procedureRepo: DrizzleProcedureRepository;
  let userAccountRepo: DrizzleUserAccountRepository;
  let scheduleConfigRepo: DrizzleScheduleConfigRepository;
  let procedureKitRepo: DrizzleProcedureKitRepository;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;
    patientRepo = new DrizzlePatientRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    appointmentRepo = new DrizzleAppointmentRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    invoiceRepo = new DrizzleInvoiceRepository(appDb, 'legacy-clinic');
    professionalRepo = new DrizzleProfessionalRepository(
      appDb,
      'legacy-clinic',
    );
    procedureRepo = new DrizzleProcedureRepository(appDb, 'legacy-clinic');
    userAccountRepo = new DrizzleUserAccountRepository(appDb, 'legacy-clinic');
    scheduleConfigRepo = new DrizzleScheduleConfigRepository(
      appDb,
      'legacy-clinic',
    );
    procedureKitRepo = new DrizzleProcedureKitRepository(appDb);
  });

  beforeEach(async () => {
    await db.delete(schema.invoicePayments);
    await db.delete(schema.invoices);
    await db.delete(schema.procedureSupplies);
    await db.delete(schema.userAccounts);
    await db.delete(schema.scheduleSettings);
    await db.delete(schema.appointments);
    await db.delete(schema.professionals);
    await db.delete(schema.packageConsumptions);
    await db.delete(schema.sessionPackages);
    await db.delete(schema.procedures);
    await db.delete(schema.patients);
  });

  const savedPatient = async () => {
    const patient = Patient.create({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
      birthDate: new Date('1980-03-10T00:00:00Z'),
      notes: 'Colostomia desde 2024',
    });
    await patientRepo.save(patient);
    return patient;
  };

  describe('Cenário: paciente ida e volta (roundtrip)', () => {
    it('Dado pacientes sem e-mail ou com o mesmo e-mail na empresa, Quando salvar, Então persiste e volta null (#325)', async () => {
      const semEmail = Patient.create({
        fullName: 'Sem Email',
        phone: '11999990001',
      });
      const mae = Patient.create({
        fullName: 'Mãe',
        email: 'cuidador@example.com',
        phone: '11999990002',
      });
      const filho = Patient.create({
        fullName: 'Filho',
        email: 'cuidador@example.com',
        phone: '11999990003',
      });
      await patientRepo.save(semEmail);
      await patientRepo.save(mae);
      await patientRepo.save(filho);

      expect((await patientRepo.findById(semEmail.id))?.email).toBeNull();
      expect(await patientRepo.findAll('cuidador@')).toHaveLength(2);
    });

    it('Dado paciente salvo, Quando buscar por id, Então todos os campos preservados', async () => {
      const patient = await savedPatient();

      const stored = await patientRepo.findById(patient.id);

      expect(stored?.fullName).toBe('Maria da Silva');
      expect(stored?.email).toBe('maria@example.com');
      expect(stored?.birthDate).toEqual(new Date('1980-03-10T00:00:00Z'));
      expect(stored?.notes).toBe('Colostomia desde 2024');
      expect(stored?.isActive).toBe(true);
    });

    it('Dado paciente atualizado, Quando salvar de novo, Então sobrescreve (upsert)', async () => {
      const patient = await savedPatient();

      await patientRepo.save(
        patient.update({ phone: '11970001111' }).deactivate(),
      );

      const stored = await patientRepo.findById(patient.id);
      expect(stored?.phone).toBe('+5511970001111');
      expect(stored?.isActive).toBe(false);
    });

    it('Dado busca por email e por termo, Quando consultar, Então encontra', async () => {
      await savedPatient();

      expect(await patientRepo.findAll('maria@example.com')).toHaveLength(1);
      expect(await patientRepo.findAll('mari')).toHaveLength(1);
      // Busca por telefone digitado com máscara acha o E.164 guardado (#324).
      expect(await patientRepo.findAll('(11) 99999')).toHaveLength(1);
      expect(await patientRepo.findAll('inexistente')).toHaveLength(0);
    });

    it('Dado vários pacientes, Quando paginar por cursor, Então percorre tudo sem repetir nem pular (issue #75)', async () => {
      const names = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elis'];
      for (const fullName of names) {
        await patientRepo.save(
          Patient.create({
            fullName,
            email: `${fullName.toLowerCase()}@example.com`,
            phone: '11999990000',
          }),
        );
      }

      const collected: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await patientRepo.findAll(undefined, { limit: 2, cursor });
        if (page.length === 0) break;
        collected.push(...page.map((p) => p.fullName));
        const last = page[page.length - 1];
        cursor = encodeCursor({ fullName: last.fullName, id: last.id });
        if (page.length < 2) break;
      }

      expect(collected).toEqual(names);
    });
  });

  describe('Cenário: consulta ida e volta com conflitos e googleEventId', () => {
    it('Dado consulta salva com googleEventId, Quando buscar, Então campos preservados', async () => {
      const patient = await savedPatient();
      const appointment = Appointment.create({
        patientId: patient.id,
        slot: slot('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z'),
        procedure: 'Troca de bolsa',
        price: Money.fromCents(25000),
      })
        .confirm()
        .withGoogleEventId('gcal-123');
      await appointmentRepo.save(appointment);

      const stored = await appointmentRepo.findById(appointment.id);

      expect(stored?.status).toBe('confirmed');
      expect(stored?.price.cents).toBe(25000);
      expect(stored?.googleEventId).toBe('gcal-123');
      expect(stored?.slot.start).toEqual(new Date('2026-07-20T09:00:00Z'));
    });

    it('Dado eventos no Google, Quando buscar os a minimizar (#339), Então lista só os pendentes da empresa, do mais recente ao mais antigo, e a marca sobrevive a novo save', async () => {
      const patient = await savedPatient();
      const build = (start: string, end: string, eventId: string | null) => {
        const appointment = Appointment.create({
          patientId: patient.id,
          slot: slot(start, end),
          procedure: 'Troca de bolsa',
          price: Money.fromCents(25000),
        });
        return eventId ? appointment.withGoogleEventId(eventId) : appointment;
      };
      const old = build(
        '2026-01-05T09:00:00Z',
        '2026-01-05T10:00:00Z',
        'g-old',
      );
      const recent = build(
        '2026-09-05T09:00:00Z',
        '2026-09-05T10:00:00Z',
        'g-new',
      );
      const noEvent = build(
        '2026-09-06T09:00:00Z',
        '2026-09-06T10:00:00Z',
        null,
      );
      for (const appointment of [old, recent, noEvent]) {
        await appointmentRepo.save(appointment);
      }

      const all = await appointmentRepo.findCalendarEventsToMinimize({
        limit: 10,
      });
      expect(all.map((a) => a.id)).toEqual([recent.id, old.id]);
      const windowed = await appointmentRepo.findCalendarEventsToMinimize({
        limit: 10,
        startsAfter: new Date('2026-06-01T00:00:00Z'),
      });
      expect(windowed.map((a) => a.id)).toEqual([recent.id]);
      expect(
        await appointmentRepo.findCalendarEventsToMinimize({ limit: 1 }),
      ).toHaveLength(1);

      await appointmentRepo.markCalendarEventMinimized(
        recent.id,
        new Date('2026-10-17T12:00:00Z'),
      );
      await appointmentRepo.save(recent.confirm());

      const pending = await appointmentRepo.findCalendarEventsToMinimize({
        limit: 10,
      });
      expect(pending.map((a) => a.id)).toEqual([old.id]);
      const other = new DrizzleAppointmentRepository(
        appDb,
        'outra-clinica',
        TEST_CIPHER,
      );
      expect(await other.findCalendarEventsToMinimize({ limit: 10 })).toEqual(
        [],
      );
      await other.markCalendarEventMinimized(old.id, new Date());
      expect(
        await appointmentRepo.findCalendarEventsToMinimize({ limit: 10 }),
      ).toHaveLength(1);
      const system = new DrizzleAppointmentRepository(appDb, null, TEST_CIPHER);
      await expect(
        system.markCalendarEventMinimized(old.id, new Date()),
      ).rejects.toThrow(/somente leitura/);
    });

    it('Dado consultas no banco, Quando buscar conflito, Então respeita status e exclusão', async () => {
      const patient = await savedPatient();
      const appointment = Appointment.create({
        patientId: patient.id,
        slot: slot('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z'),
        procedure: 'Troca de bolsa',
        price: Money.fromCents(25000),
      });
      await appointmentRepo.save(appointment);

      const overlapping = slot('2026-07-20T09:30:00Z', '2026-07-20T10:30:00Z');
      expect(await appointmentRepo.findConflicting(overlapping)).toHaveLength(
        1,
      );
      expect(
        await appointmentRepo.findConflicting(overlapping, appointment.id),
      ).toHaveLength(0);

      await appointmentRepo.save(appointment.cancel());
      expect(await appointmentRepo.findConflicting(overlapping)).toHaveLength(
        0,
      );
    });

    it('Dado consultas em datas distintas, Quando buscar por período, Então filtra corretamente', async () => {
      const patient = await savedPatient();
      const july = Appointment.create({
        patientId: patient.id,
        slot: slot('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z'),
        procedure: 'Troca de bolsa',
        price: Money.fromCents(25000),
      });
      const august = Appointment.create({
        patientId: patient.id,
        slot: slot('2026-08-05T09:00:00Z', '2026-08-05T10:00:00Z'),
        procedure: 'Avaliação',
        price: Money.fromCents(20000),
      });
      await appointmentRepo.save(july);
      await appointmentRepo.save(august);

      const result = await appointmentRepo.findInRange(
        new Date('2026-07-01T00:00:00Z'),
        new Date('2026-08-01T00:00:00Z'),
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(july.id);
      expect(await appointmentRepo.findByPatientId(patient.id)).toHaveLength(2);
    });
  });

  describe('Cenário: constraint do banco impede double-booking (TOCTOU)', () => {
    const makeAppointment = (
      patientId: string,
      startIso: string,
      endIso: string,
    ) =>
      Appointment.create({
        patientId,
        slot: slot(startIso, endIso),
        procedure: 'Troca de bolsa',
        price: Money.fromCents(25000),
      });

    it('Dado consulta ativa, Quando inserir sobreposta direto no banco, Então SchedulingConflictError', async () => {
      const patient = await savedPatient();
      await appointmentRepo.save(
        makeAppointment(
          patient.id,
          '2026-07-20T09:00:00Z',
          '2026-07-20T10:00:00Z',
        ),
      );

      await expect(
        appointmentRepo.save(
          makeAppointment(
            patient.id,
            '2026-07-20T09:30:00Z',
            '2026-07-20T10:30:00Z',
          ),
        ),
      ).rejects.toThrow(SchedulingConflictError);
    });

    it('Dado consulta ativa, Quando inserir com folga de 10min, Então banco rejeita; com 15min, aceita', async () => {
      const patient = await savedPatient();
      await appointmentRepo.save(
        makeAppointment(
          patient.id,
          '2026-07-20T09:00:00Z',
          '2026-07-20T10:00:00Z',
        ),
      );

      await expect(
        appointmentRepo.save(
          makeAppointment(
            patient.id,
            '2026-07-20T10:10:00Z',
            '2026-07-20T11:00:00Z',
          ),
        ),
      ).rejects.toThrow(SchedulingConflictError);
      await expect(
        appointmentRepo.save(
          makeAppointment(
            patient.id,
            '2026-07-20T10:15:00Z',
            '2026-07-20T11:00:00Z',
          ),
        ),
      ).resolves.toBeUndefined();
    });

    it('Dado consulta cancelada no horário, Quando inserir sobreposta, Então banco aceita', async () => {
      const patient = await savedPatient();
      await appointmentRepo.save(
        makeAppointment(
          patient.id,
          '2026-07-20T09:00:00Z',
          '2026-07-20T10:00:00Z',
        ).cancel(),
      );

      await expect(
        appointmentRepo.save(
          makeAppointment(
            patient.id,
            '2026-07-20T09:00:00Z',
            '2026-07-20T10:00:00Z',
          ),
        ),
      ).resolves.toBeUndefined();
    });

    it('Dado a própria consulta, Quando atualizar (upsert) mesmo horário, Então não conflita consigo', async () => {
      const patient = await savedPatient();
      const appointment = makeAppointment(
        patient.id,
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await appointmentRepo.save(appointment);

      await expect(
        appointmentRepo.save(appointment.confirm()),
      ).resolves.toBeUndefined();
    });
  });

  describe('Cenário: transação (DrizzleTransactionManager)', () => {
    it('Dado erro dentro da transação, Quando run, Então nada persiste (CONS2-01); sem erro, tudo persiste (CONS2-02)', async () => {
      const { DrizzleTransactionManager } = await import(
        '@/infrastructure/persistence/drizzle/drizzle-transaction-manager'
      );
      const manager = new DrizzleTransactionManager(
        appDb,
        'legacy-clinic',
        TEST_CIPHER,
      );
      const patient = await savedPatient();
      const failing = Appointment.create({
        patientId: patient.id,
        slot: slot('2026-07-21T09:00:00Z', '2026-07-21T10:00:00Z'),
        procedure: 'Troca de bolsa',
        price: Money.fromCents(25000),
      });

      await expect(
        manager.run(async (repos) => {
          await repos.appointments.save(failing);
          throw new Error('falha simulada após o save');
        }),
      ).rejects.toThrow('falha simulada após o save');
      expect(await appointmentRepo.findById(failing.id)).toBeNull();

      const committed = Appointment.create({
        patientId: patient.id,
        slot: slot('2026-07-22T09:00:00Z', '2026-07-22T10:00:00Z'),
        procedure: 'Troca de bolsa',
        price: Money.fromCents(25000),
      });
      const invoice = Invoice.create({
        patientId: patient.id,
        description: 'Consulta',
        amount: Money.fromCents(25000),
        appointmentId: committed.id,
      });
      await manager.run(async (repos) => {
        await repos.appointments.save(committed);
        await repos.invoices.save(invoice);
      });
      expect(await appointmentRepo.findById(committed.id)).not.toBeNull();
      expect(await invoiceRepo.findById(invoice.id)).not.toBeNull();
    });

    it('Dado consumo de pacote dentro de transação que falha, Quando run, Então o consumo é revertido (edge case CONS2-01)', async () => {
      const { DrizzleTransactionManager } = await import(
        '@/infrastructure/persistence/drizzle/drizzle-transaction-manager'
      );
      const { DrizzleSessionPackageRepository } = await import(
        '@/infrastructure/persistence/drizzle/drizzle-package-repository'
      );
      const { SessionPackage } = await import('@/domain/billing/package');
      const manager = new DrizzleTransactionManager(
        appDb,
        'legacy-clinic',
        TEST_CIPHER,
      );
      const packageRepo = new DrizzleSessionPackageRepository(
        appDb,
        'legacy-clinic',
      );
      const patient = await savedPatient();
      const procedure = Procedure.create({
        name: 'Curativo pacote tx',
        priceCents: 10000,
        durationMinutes: 30,
      });
      await procedureRepo.save(procedure);
      const pkg = SessionPackage.create({
        patientId: patient.id,
        procedureId: procedure.id,
        totalSessions: 5,
        priceCents: 40000,
      });
      await packageRepo.save(pkg);

      await expect(
        manager.run(async (repos) => {
          await repos.sessionPackages.save(pkg.consumeSession());
          await repos.sessionPackages.recordConsumption(
            pkg.id,
            'appt-tx-falha',
          );
          throw new Error('falha após consumir pacote');
        }),
      ).rejects.toThrow('falha após consumir pacote');

      expect((await packageRepo.findById(pkg.id))?.usedSessions).toBe(0);
      expect(await packageRepo.wasConsumedBy('appt-tx-falha')).toBe(false);
    });
  });

  describe('Cenário: fatura ida e volta com filtros', () => {
    it('Dado fatura paga salva, Quando buscar, Então método e data de pagamento preservados', async () => {
      const patient = await savedPatient();
      const invoice = Invoice.create({
        patientId: patient.id,
        description: 'Consulta',
        amount: Money.fromCents(25000),
        appointmentId: 'appt-1',
      }).markPaid('pix', new Date('2026-07-15T12:00:00Z'));
      await invoiceRepo.save(invoice);

      const stored = await invoiceRepo.findById(invoice.id);

      expect(stored?.status).toBe('paid');
      expect(stored?.paymentMethod).toBe('pix');
      expect(stored?.paidAt).toEqual(new Date('2026-07-15T12:00:00Z'));
      expect(await invoiceRepo.findByAppointmentId('appt-1')).not.toBeNull();
    });

    it('Dado faturas variadas, Quando filtrar por status e período, Então retorna subconjunto', async () => {
      const patient = await savedPatient();
      const pending = Invoice.create({
        patientId: patient.id,
        description: 'A',
        amount: Money.fromCents(10000),
      });
      const paid = Invoice.create({
        patientId: patient.id,
        description: 'B',
        amount: Money.fromCents(20000),
      }).markPaid('cash');
      await invoiceRepo.save(pending);
      await invoiceRepo.save(paid);

      expect(await invoiceRepo.findAll({ status: 'paid' })).toHaveLength(1);
      expect(await invoiceRepo.findAll({ patientId: patient.id })).toHaveLength(
        2,
      );
      expect(
        await invoiceRepo.findAll({ from: new Date(Date.now() + 86_400_000) }),
      ).toHaveLength(0);
    });

    it('Dado várias faturas, Quando paginar por cursor, Então percorre tudo sem repetir nem pular (issue #75)', async () => {
      const patient = await savedPatient();
      for (let i = 0; i < 5; i += 1) {
        await invoiceRepo.save(
          Invoice.create({
            patientId: patient.id,
            description: `Fatura ${i}`,
            amount: Money.fromCents(1000 * (i + 1)),
          }),
        );
      }
      const fullOrder = (await invoiceRepo.findAll()).map((i) => i.id);

      const collected: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await invoiceRepo.findAll({}, { limit: 2, cursor });
        if (page.length === 0) break;
        collected.push(...page.map((i) => i.id));
        const last = page[page.length - 1];
        cursor = encodeCursor({
          issuedAt: last.issuedAt.toISOString(),
          id: last.id,
        });
        if (page.length < 2) break;
      }

      expect(collected).toEqual(fullOrder);
    });
  });

  describe('Cenário: consultas em lote e por profissional', () => {
    const makeAppointment = (
      patientId: string,
      startIso: string,
      endIso: string,
      professionalId?: string | null,
    ) =>
      Appointment.create({
        patientId,
        slot: slot(startIso, endIso),
        procedure: 'Troca de bolsa',
        price: Money.fromCents(25000),
        professionalId,
      });

    it('Dado ids vazios, Quando buscar consultas em lote, Então retorna array vazio', async () => {
      expect(await appointmentRepo.findByIds([])).toEqual([]);
      expect(await appointmentRepo.findByPatientIds([])).toEqual([]);
    });

    it('Dado consultas salvas, Quando buscar por ids e por pacientes com endsAfter, Então filtra', async () => {
      const patient = await savedPatient();
      const past = makeAppointment(
        patient.id,
        '2020-01-10T09:00:00Z',
        '2020-01-10T10:00:00Z',
      );
      const future = makeAppointment(
        patient.id,
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await appointmentRepo.save(past);
      await appointmentRepo.save(future);

      const byIds = await appointmentRepo.findByIds([
        past.id,
        past.id,
        future.id,
      ]);
      expect(byIds).toHaveLength(2);

      const afterFilter = await appointmentRepo.findByPatientIds([patient.id], {
        endsAfter: new Date('2025-01-01T00:00:00Z'),
      });
      expect(afterFilter).toHaveLength(1);
      expect(afterFilter[0].id).toBe(future.id);
      expect(await appointmentRepo.findByPatientIds([patient.id])).toHaveLength(
        2,
      );
    });

    it('Dado consultas de profissionais distintos, Quando filtrar range por profissional, Então escopa', async () => {
      const patient = await savedPatient();
      const professional = Professional.create({ fullName: 'Ana Enfermeira' });
      await professionalRepo.save(professional);

      await appointmentRepo.save(
        makeAppointment(
          patient.id,
          '2026-07-20T09:00:00Z',
          '2026-07-20T10:00:00Z',
          professional.id,
        ),
      );
      await appointmentRepo.save(
        makeAppointment(
          patient.id,
          '2026-07-20T11:00:00Z',
          '2026-07-20T12:00:00Z',
        ),
      );

      const scoped = await appointmentRepo.findInRange(
        new Date('2026-07-20T00:00:00Z'),
        new Date('2026-07-21T00:00:00Z'),
        { professionalId: professional.id },
      );
      expect(scoped).toHaveLength(1);

      const all = await appointmentRepo.findInRange(
        new Date('2026-07-20T00:00:00Z'),
        new Date('2026-07-21T00:00:00Z'),
      );
      expect(all).toHaveLength(2);
    });

    it('Dado consulta atribuída, Quando buscar conflito escopado por profissional, Então respeita atribuição', async () => {
      const patient = await savedPatient();
      const professionalA = Professional.create({ fullName: 'Ana Enfermeira' });
      const professionalB = Professional.create({ fullName: 'Beto Técnico' });
      await professionalRepo.save(professionalA);
      await professionalRepo.save(professionalB);

      await appointmentRepo.save(
        makeAppointment(
          patient.id,
          '2026-07-20T09:00:00Z',
          '2026-07-20T10:00:00Z',
          professionalA.id,
        ),
      );

      const overlapping = slot('2026-07-20T09:30:00Z', '2026-07-20T10:30:00Z');
      expect(
        await appointmentRepo.findConflicting(
          overlapping,
          undefined,
          professionalA.id,
        ),
      ).toHaveLength(1);
      expect(
        await appointmentRepo.findConflicting(
          overlapping,
          undefined,
          professionalB.id,
        ),
      ).toHaveLength(0);
    });

    it('Dado consultas concluídas, Quando obter estatísticas e produção no período, Então agrega corretamente', async () => {
      const patient = await savedPatient();
      const professional = Professional.create({ fullName: 'Ana Enfermeira' });
      await professionalRepo.save(professional);

      const completed = makeAppointment(
        patient.id,
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
        professional.id,
      )
        .confirm()
        .complete();
      const cancelled = makeAppointment(
        patient.id,
        '2026-07-20T11:00:00Z',
        '2026-07-20T12:00:00Z',
      ).cancel();
      await appointmentRepo.save(completed);
      await appointmentRepo.save(cancelled);

      const stats = await appointmentRepo.getStatsInRange(
        new Date('2026-07-20T00:00:00Z'),
        new Date('2026-07-21T00:00:00Z'),
      );
      expect(stats.byStatus.completed).toBe(1);
      expect(stats.byStatus.cancelled).toBe(1);
      expect(stats.revenueByProcedure[0]).toEqual({
        procedure: 'Troca de bolsa',
        count: 1,
        totalCents: 25000,
      });

      const sessions = await new DrizzleProducedSessionRepository(
        appDb,
        'legacy-clinic',
      ).findCompletedInRange(
        new Date('2026-07-20T00:00:00Z'),
        new Date('2026-07-21T00:00:00Z'),
      );
      expect(sessions).toEqual([
        {
          appointmentId: completed.id,
          professionalId: professional.id,
          procedure: 'Troca de bolsa',
          sessionDate: new Date('2026-07-20T09:00:00Z'),
          listPriceCents: 25000,
          invoice: null,
          package: null,
        },
      ]);
    });
  });

  describe('Cenário: catálogo de procedimentos', () => {
    it('Dado procedimento salvo, Quando buscar por id e nome, Então campos preservados', async () => {
      const procedure = Procedure.create({
        name: 'Curativo especial',
        priceCents: 12000,
        durationMinutes: 30,
      });
      await procedureRepo.save(procedure);

      const byId = await procedureRepo.findById(procedure.id);
      expect(byId?.name).toBe('Curativo especial');
      expect(byId?.priceCents).toBe(12000);

      expect(
        await procedureRepo.findByName('curativo ESPECIAL'),
      ).not.toBeNull();
      expect(await procedureRepo.findByName('inexistente')).toBeNull();
    });

    it('Dado id e nome inexistentes, Quando buscar, Então retorna null', async () => {
      expect(await procedureRepo.findById('id-inexistente')).toBeNull();
    });

    it('Dado procedimento desativado, Quando salvar (upsert) e listar, Então reflete estado', async () => {
      const procedure = Procedure.create({
        name: 'Avaliação',
        priceCents: 10000,
        durationMinutes: 20,
      });
      await procedureRepo.save(procedure);
      await procedureRepo.save(procedure.deactivate());

      expect((await procedureRepo.findById(procedure.id))?.isActive).toBe(
        false,
      );
      expect(await procedureRepo.findAll()).toHaveLength(1);
    });
  });

  describe('Cenário: kit padrão de insumos por procedimento', () => {
    it('Dado procedimento sem kit, Quando consultar, Então retorna lista vazia', async () => {
      const procedure = Procedure.create({
        name: 'Sem kit',
        priceCents: 5000,
        durationMinutes: 15,
      });
      await procedureRepo.save(procedure);

      expect(await procedureKitRepo.getKit(procedure.id)).toEqual([]);
    });

    it('Dado itens definidos, Quando substituir o kit, Então reflete a nova lista', async () => {
      const procedure = Procedure.create({
        name: 'Com kit',
        priceCents: 5000,
        durationMinutes: 15,
      });
      await procedureRepo.save(procedure);

      await procedureKitRepo.setKit(procedure.id, [
        { supplyId: 'supply-1', quantity: 2 },
        { supplyId: 'supply-2', quantity: 1 },
      ]);
      expect(await procedureKitRepo.getKit(procedure.id)).toHaveLength(2);

      await procedureKitRepo.setKit(procedure.id, [
        { supplyId: 'supply-1', quantity: 5 },
      ]);
      const updated = await procedureKitRepo.getKit(procedure.id);
      expect(updated).toEqual([{ supplyId: 'supply-1', quantity: 5 }]);

      await procedureKitRepo.setKit(procedure.id, []);
      expect(await procedureKitRepo.getKit(procedure.id)).toEqual([]);
    });

    it('Dado kits de múltiplos procedimentos, Quando countByProcedure, Então agrupa a contagem por procedimento (PROC-03)', async () => {
      const withKit = Procedure.create({
        name: 'Com kit',
        priceCents: 5000,
        durationMinutes: 15,
      });
      const withoutKit = Procedure.create({
        name: 'Sem kit',
        priceCents: 3000,
        durationMinutes: 10,
      });
      await procedureRepo.save(withKit);
      await procedureRepo.save(withoutKit);

      await procedureKitRepo.setKit(withKit.id, [
        { supplyId: 'supply-1', quantity: 2 },
        { supplyId: 'supply-2', quantity: 1 },
      ]);

      const counts = await procedureKitRepo.countByProcedure();
      expect(counts[withKit.id]).toBe(2);
      expect(counts[withoutKit.id]).toBeUndefined();
    });
  });

  describe('Cenário: contas de acesso da equipe', () => {
    it('Dado conta salva, Quando buscar por email, Então normaliza e preserva campos', async () => {
      const account = UserAccount.create({
        email: 'Equipe@Clinica.com',
        passwordHash: 'scrypt$1$salt$hash',
        role: 'company_admin',
        clinicId: 'legacy-clinic',
      });
      await userAccountRepo.save(account);

      const stored = await userAccountRepo.findByEmail('equipe@clinica.com');
      expect(stored?.email).toBe('equipe@clinica.com');
      expect(stored?.passwordHash).toBe('scrypt$1$salt$hash');
      expect(stored?.isActive).toBe(true);
      expect(stored?.role).toBe('company_admin');
    });

    it('Dado email não cadastrado, Quando buscar, Então retorna null', async () => {
      expect(
        await userAccountRepo.findByEmail('ninguem@clinica.com'),
      ).toBeNull();
    });

    it('Dado contas salvas, Quando desativar (upsert) e listar, Então reflete estado', async () => {
      const account = UserAccount.create({
        email: 'outra@clinica.com',
        passwordHash: 'scrypt$1$salt$hash',
        role: 'company_admin',
        clinicId: 'legacy-clinic',
      });
      await userAccountRepo.save(account);
      await userAccountRepo.save(account.deactivate());

      expect(
        (await userAccountRepo.findByEmail('outra@clinica.com'))?.isActive,
      ).toBe(false);
      expect(await userAccountRepo.findAll()).toHaveLength(1);
    });
  });

  describe('Cenário: configuração da agenda da clínica', () => {
    it('Dado nenhuma configuração salva, Quando buscar, Então retorna null', async () => {
      expect(await scheduleConfigRepo.get()).toBeNull();
    });

    it('Dado configuração salva, Quando buscar (upsert), Então retorna a mais recente', async () => {
      await scheduleConfigRepo.save(DEFAULT_SCHEDULE_CONFIG);
      await scheduleConfigRepo.save({
        ...DEFAULT_SCHEDULE_CONFIG,
        startHour: 7,
      });

      const stored = await scheduleConfigRepo.get();
      expect(stored?.startHour).toBe(7);
      expect(stored?.weekdays).toEqual(DEFAULT_SCHEDULE_CONFIG.weekdays);
    });

    it('Dado configuração corrompida no banco, Quando buscar, Então cai no default (retorna null)', async () => {
      await db.insert(schema.scheduleSettings).values({
        id: 'default',
        clinicId: 'legacy-clinic',
        weekdays: 'não-é-json',
        startHour: 8,
        endHour: 18,
        minGapMinutes: 15,
        updatedAt: new Date(),
      });

      expect(await scheduleConfigRepo.get()).toBeNull();
    });
  });
});
