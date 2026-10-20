import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Invoice } from '@/domain/billing/invoice';
import { SessionPackage } from '@/domain/billing/package';
import { Procedure } from '@/domain/catalog/procedure';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAppointmentRepository } from '@/infrastructure/persistence/drizzle/drizzle-appointment-repository';
import { DrizzleProcedureRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import { DrizzleInvoiceRepository } from '@/infrastructure/persistence/drizzle/drizzle-invoice-repository';
import { DrizzleSessionPackageRepository } from '@/infrastructure/persistence/drizzle/drizzle-package-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import {
  DrizzleProducedSessionRepository,
  preferred,
} from '@/infrastructure/persistence/drizzle/drizzle-produced-session-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';

describe('Feature: Produção do mês usa a fatura vigente da consulta e do pacote (#296)', () => {
  let appDb: AppDb;

  beforeAll(async () => {
    appDb = drizzle(await createPgliteFromTemplate(), {
      schema,
    }) as unknown as AppDb;
  });

  it('Dado consulta de pacote com faturas cancelada, pendente e paga, Quando listar a produção, Então prefere a paga, tanto na consulta quanto na venda do pacote', async () => {
    const patients = new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER);
    const appointments = new DrizzleAppointmentRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const invoices = new DrizzleInvoiceRepository(appDb, CLINIC, TEST_CIPHER);
    const packages = new DrizzleSessionPackageRepository(appDb, CLINIC);
    const procedures = new DrizzleProcedureRepository(appDb, CLINIC);

    const patient = Patient.create({
      fullName: 'Maria da Silva',
      phone: '11999990000',
    });
    await patients.save(patient);
    const procedure = Procedure.create({
      name: 'Troca de bolsa',
      priceCents: 25000,
      durationMinutes: 60,
    });
    await procedures.save(procedure);
    const pkg = SessionPackage.create({
      patientId: patient.id,
      procedureId: procedure.id,
      totalSessions: 5,
      priceCents: 100000,
    });
    await packages.save(pkg);
    const appointment = Appointment.create({
      patientId: patient.id,
      slot: TimeSlot.create(
        new Date('2026-07-20T09:00:00Z'),
        new Date('2026-07-20T10:00:00Z'),
      ),
      procedure: 'Troca de bolsa',
      price: Money.fromCents(25000),
    })
      .confirm()
      .complete();
    await appointments.save(appointment);
    await packages.recordConsumption(pkg.id, appointment.id);

    const fatura = (extra: Record<string, unknown>) =>
      Invoice.create({
        patientId: patient.id,
        description: 'Fatura',
        amount: Money.fromCents(25000),
        ...extra,
      });
    const emitir = async (extra: Record<string, unknown>) => {
      const base = fatura(extra);
      await invoices.save(base);
      return base;
    };
    for (const extra of [
      { appointmentId: appointment.id },
      { sessionPackageId: pkg.id },
    ]) {
      const cancelada = (await emitir(extra)).cancel();
      await invoices.save(cancelada);
      await emitir(extra);
      const paga = (await emitir(extra)).registerPayment({
        amount: Money.fromCents(25000),
        method: 'pix',
      });
      await invoices.save(paga);
    }

    const sessions = await new DrizzleProducedSessionRepository(
      appDb,
      CLINIC,
    ).findCompletedInRange(
      new Date('2026-07-20T00:00:00Z'),
      new Date('2026-07-21T00:00:00Z'),
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0].invoice?.status).toBe('paid');
    expect(sessions[0].package?.invoice?.status).toBe('paid');
  });

  it('Dado consulta sem pacote com duas faturas, Quando listar a produção, Então usa a fatura vigente e não inventa pacote', async () => {
    const patients = new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER);
    const appointments = new DrizzleAppointmentRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const invoices = new DrizzleInvoiceRepository(appDb, CLINIC, TEST_CIPHER);
    const patient = Patient.create({
      fullName: 'Bia Souza',
      phone: '11999990000',
    });
    await patients.save(patient);
    const appointment = Appointment.create({
      patientId: patient.id,
      slot: TimeSlot.create(
        new Date('2026-08-20T09:00:00Z'),
        new Date('2026-08-20T10:00:00Z'),
      ),
      procedure: 'Curativo',
      price: Money.fromCents(15000),
    })
      .confirm()
      .complete();
    await appointments.save(appointment);
    const nova = () =>
      Invoice.create({
        patientId: patient.id,
        description: 'Curativo',
        amount: Money.fromCents(15000),
        appointmentId: appointment.id,
      });
    await invoices.save(nova().cancel());
    await invoices.save(nova());

    const sessions = await new DrizzleProducedSessionRepository(
      appDb,
      CLINIC,
    ).findCompletedInRange(
      new Date('2026-08-20T00:00:00Z'),
      new Date('2026-08-21T00:00:00Z'),
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0].invoice?.status).toBe('pending');
    expect(sessions[0].package).toBeNull();
  });

  it('Dado filtro por profissional sem sessões dele, Quando listar a produção, Então nada volta', async () => {
    const sessions = await new DrizzleProducedSessionRepository(
      appDb,
      CLINIC,
    ).findCompletedInRange(
      new Date('2026-07-01T00:00:00Z'),
      new Date('2026-09-01T00:00:00Z'),
      { professionalId: 'profissional-sem-sessoes' },
    );
    expect(sessions).toEqual([]);
  });
});

describe('Feature: Fatura vigente entre duas referências', () => {
  const ref = (status: 'paid' | 'pending' | 'cancelled') => ({
    status,
    issuedAt: new Date('2026-07-01T00:00:00Z'),
    dueDate: null,
  });

  it('Dado referência ausente de um lado, Quando escolher a vigente, Então fica a que existe', () => {
    expect(preferred(null, ref('pending'))).toEqual(ref('pending'));
    expect(preferred(ref('pending'), null)).toEqual(ref('pending'));
    expect(preferred(null, null)).toBeNull();
  });

  it('Dado fatura cancelada e fatura paga, Quando escolher a vigente, Então vale a paga em qualquer ordem', () => {
    expect(preferred(ref('cancelled'), ref('paid'))?.status).toBe('paid');
    expect(preferred(ref('paid'), ref('cancelled'))?.status).toBe('paid');
  });
});
