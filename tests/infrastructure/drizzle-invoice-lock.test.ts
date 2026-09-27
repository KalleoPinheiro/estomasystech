import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Invoice } from '@/domain/billing/invoice';
import { Patient } from '@/domain/patient/patient';
import { Money } from '@/domain/shared/money';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleInvoiceRepository } from '@/infrastructure/persistence/drizzle/drizzle-invoice-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

/**
 * Issue #192: o PGlite da suíte tem uma conexão só e serializa transações,
 * então o teste de rota não distingue "roda em transação" de "trava a linha".
 * No Postgres real (pool com várias conexões) é o `FOR UPDATE` que impede o
 * recebimento em dobro — aqui se prova que a leitura das ações o emite.
 */
describe('Feature: leitura da fatura com lock de linha (#192)', () => {
  const queries: string[] = [];
  let repo: DrizzleInvoiceRepository;
  let invoiceId: string;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    const db = drizzle(client, {
      schema,
      logger: { logQuery: (query) => queries.push(query) },
    }) as unknown as AppDb;
    const patient = Patient.create({
      fullName: 'Paciente Lock',
      email: 'lock@x.com',
      phone: '11999990000',
    });
    await new DrizzlePatientRepository(db, 'legacy-clinic', TEST_CIPHER).save(
      patient,
    );
    repo = new DrizzleInvoiceRepository(db, 'legacy-clinic');
    const invoice = Invoice.create({
      patientId: patient.id,
      description: 'Curativo',
      amount: Money.fromCents(10000),
    });
    await repo.save(invoice);
    invoiceId = invoice.id;
  });

  it('C21 findByIdForUpdate trava a linha da fatura (SELECT … FOR UPDATE)', async () => {
    queries.length = 0;

    const found = await repo.findByIdForUpdate(invoiceId);

    expect(found?.id).toBe(invoiceId);
    const invoiceSelect = queries.find((q) => /from "invoices"/i.test(q));
    expect(invoiceSelect).toMatch(/for update$/i);
  });

  it('findById comum não trava', async () => {
    queries.length = 0;

    await repo.findById(invoiceId);

    const invoiceSelect = queries.find((q) => /from "invoices"/i.test(q));
    expect(invoiceSelect).not.toMatch(/for update/i);
  });
});
