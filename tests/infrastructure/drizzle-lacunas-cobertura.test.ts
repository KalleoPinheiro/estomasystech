import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Invoice } from '@/domain/billing/invoice';
import { ReminderLog } from '@/domain/messaging/reminder-log';
import { DataSubjectRequest } from '@/domain/patient/data-subject-request';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import {
  DEFAULT_CANCELLATION_POLICY,
  DEFAULT_SCHEDULE_CONFIG,
} from '@/domain/scheduling/schedule-config';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAppointmentRepository } from '@/infrastructure/persistence/drizzle/drizzle-appointment-repository';
import { DrizzleDataSubjectRequestRepository } from '@/infrastructure/persistence/drizzle/drizzle-data-subject-request-repository';
import { DrizzleScheduleConfigRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import { DrizzleInvoiceRepository } from '@/infrastructure/persistence/drizzle/drizzle-invoice-repository';
import { DrizzleMfaRepository } from '@/infrastructure/persistence/drizzle/drizzle-mfa-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleReminderLogRepository } from '@/infrastructure/persistence/drizzle/drizzle-reminder-log-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';

/** Banco falso cuja escrita da consulta/pedido falha com o erro dado. */
const dbFailingWith = (error: unknown) =>
  ({
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () => Promise.reject(error),
          // biome-ignore lint/suspicious/noThenProperty: imita o builder awaitable do Drizzle
          then: (_: unknown, reject: (e: unknown) => void) => reject(error),
        }),
      }),
    }),
  }) as unknown as AppDb;

describe('Feature: Persistência em Postgres tolera dados legados e propaga falhas desconhecidas', () => {
  let pg: ReturnType<typeof drizzle<typeof schema>>;
  let appDb: AppDb;
  let patient: Patient;

  beforeAll(async () => {
    pg = drizzle(await createPgliteFromTemplate(), { schema });
    appDb = pg as unknown as AppDb;
    patient = Patient.create({
      fullName: 'Maria da Silva',
      phone: '11999990000',
    });
    await new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER).save(
      patient,
    );
  });

  it('Dado horário legado sem prazo nem multa de cancelamento, Quando ler a grade, Então volta a política padrão', async () => {
    const repo = new DrizzleScheduleConfigRepository(appDb, CLINIC);
    await repo.save(DEFAULT_SCHEDULE_CONFIG);
    await pg
      .update(schema.scheduleSettings)
      .set({ cancelNoticeHours: null, lateCancelFeeCents: null });

    expect((await repo.get())?.cancellationPolicy).toEqual(
      DEFAULT_CANCELLATION_POLICY,
    );
  });

  it('Dado consulta com status desconhecido no banco, Quando calcular as estatísticas, Então ignora o status em vez de quebrar', async () => {
    const appointments = new DrizzleAppointmentRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const appointment = Appointment.create({
      patientId: patient.id,
      slot: TimeSlot.create(
        new Date('2026-10-20T09:00:00Z'),
        new Date('2026-10-20T10:00:00Z'),
      ),
      procedure: 'Curativo',
      price: Money.fromCents(15000),
    });
    await appointments.save(appointment);
    await pg.execute(
      sql.raw(
        `UPDATE appointments SET status = 'xpto' WHERE id = '${appointment.id}'`,
      ),
    );

    const stats = await appointments.getStatsInRange(
      new Date('2026-10-20T00:00:00Z'),
      new Date('2026-10-21T00:00:00Z'),
    );

    expect(Object.values(stats.byStatus).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it.each([
    ['erro comum', new Error('conexão caiu')],
    ['valor que não é objeto', 'falha textual'],
  ])(
    'Dado %s ao gravar a consulta, Quando salvar, Então propaga sem virar conflito de agenda',
    async (_, failure) => {
      const appointment = Appointment.create({
        patientId: patient.id,
        slot: TimeSlot.create(
          new Date('2026-10-21T09:00:00Z'),
          new Date('2026-10-21T10:00:00Z'),
        ),
        procedure: 'Curativo',
        price: Money.fromCents(15000),
      });
      const repo = new DrizzleAppointmentRepository(
        dbFailingWith(failure),
        CLINIC,
        TEST_CIPHER,
      );

      await expect(repo.save(appointment)).rejects.toBe(failure);
    },
  );

  it('Dado falha que não é de unicidade ao gravar o pedido do titular, Quando salvar, Então propaga o erro original', async () => {
    const failure = new Error('conexão caiu');
    const repo = new DrizzleDataSubjectRequestRepository(
      dbFailingWith(failure),
      CLINIC,
      TEST_CIPHER,
    );

    await expect(
      repo.save(
        DataSubjectRequest.create({ patientId: patient.id, kind: 'erasure' }),
      ),
    ).rejects.toBe(failure);
  });

  it('Dado desconto gravado sem motivo (legado), Quando ler a fatura, Então o motivo vem vazio', async () => {
    const repo = new DrizzleInvoiceRepository(appDb, CLINIC, TEST_CIPHER);
    const invoice = Invoice.create({
      patientId: patient.id,
      description: 'Curativo',
      amount: Money.fromCents(20000),
    }).applyDiscount(Money.fromCents(2000), 'Fidelidade');
    await repo.save(invoice);
    await pg.execute(
      sql.raw(
        `UPDATE invoices SET discount_reason = NULL WHERE id = '${invoice.id}'`,
      ),
    );

    const found = await repo.findById(invoice.id);

    expect(found?.discount?.reason).toBe('');
    expect(found?.discount?.amount.cents).toBe(2000);
  });

  it('Dado duas confirmações do mesmo token de MFA, Quando concluir o cadastro, Então só a primeira vale', async () => {
    await pg.insert(schema.userAccounts).values({
      id: 'acc-mfa',
      clinicId: CLINIC,
      email: 'mfa@clinica.com',
      passwordHash: 'scrypt$1$s$h',
      role: 'company_admin',
      active: true,
      sessionVersion: 0,
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });
    const repo = new DrizzleMfaRepository(appDb, TEST_CIPHER);
    const input = {
      accountId: 'acc-mfa',
      secret: 'JBSWY3DPEHPK3PXP',
      step: 10,
      recoveryCodeHashes: ['h1', 'h2'],
      expectedSessionVersion: 0,
      now: new Date('2026-10-02T00:00:00Z'),
    };

    expect(await repo.completeEnrollment(input)).toBe(true);
    expect(await repo.completeEnrollment(input)).toBe(false);
  });

  it('Dado id de paciente inexistente, Quando buscar a empresa dele, Então não há empresa', async () => {
    const repo = new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER);

    expect(await repo.findClinicIdById('inexistente')).toBeNull();
    expect(await repo.findClinicIdById(patient.id)).toBe(CLINIC);
  });

  it('Dado busca por nome e lista de ids da página, Quando listar pacientes, Então aplica os dois filtros juntos', async () => {
    const repo = new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER);
    const outra = Patient.create({
      fullName: 'Maria Antônia',
      phone: '11988880000',
    });
    await repo.save(outra);

    const found = await repo.findAll('maria', { ids: [outra.id] });

    expect(found.map((p) => p.id)).toEqual([outra.id]);
  });
  it('Dado recall por e-mail com duas tentativas no mesmo dia, Quando buscar o primeiro envio, Então fica o mais antigo', async () => {
    const repo = new DrizzleReminderLogRepository(appDb, CLINIC);
    const day = new Date('2026-10-05T12:00:00Z');
    await repo.save(
      ReminderLog.create('recall', 'fu-dup', day, { attempt: 1 }),
    );
    await repo.save(
      ReminderLog.create('recall', 'fu-dup', day, { attempt: 2 }),
    );

    const first = await repo.firstSentAt(
      'recall',
      'email',
      ['fu-dup'],
      ReminderLog.create('recall', 'fu-dup', day).sentOn,
    );

    expect(first.size).toBe(1);
  });
});
