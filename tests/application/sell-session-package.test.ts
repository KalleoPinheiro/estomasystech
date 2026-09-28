import { beforeEach, describe, expect, it } from 'vitest';
import { SellSessionPackage } from '@/application/billing/sell-session-package';
import { CreatePatient } from '@/application/patients/create-patient';
import {
  NoTransactionManager,
  type TransactionManager,
  type TransactionScope,
} from '@/application/ports/transaction-manager';
import { Procedure } from '@/domain/catalog/procedure';
import type { Patient } from '@/domain/patient/patient';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import {
  InMemoryProcedureRepository,
  InMemoryUserAccountRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

describe('Feature: Venda de pacote de sessões (SellSessionPackage)', () => {
  let patients: InMemoryPatientRepository;
  let procedures: InMemoryProcedureRepository;
  let scope: TransactionScope;
  let maria: Patient;
  let procedure: Procedure;

  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    procedures = new InMemoryProcedureRepository();
    scope = {
      appointments: new InMemoryAppointmentRepository(),
      invoices: new InMemoryInvoiceRepository(),
      followUps: new InMemoryFollowUpRepository(),
      sessionPackages: new InMemorySessionPackageRepository(),
      userAccounts: new InMemoryUserAccountRepository(),
      auditEvents: new InMemoryAuditEventRepository(),
    };
    maria = await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    procedure = Procedure.create({
      name: 'Curativo',
      priceCents: 15000,
      durationMinutes: 40,
    });
    await procedures.save(procedure);
  });

  const sell = (
    priceCents: number,
    transactions: TransactionManager = new NoTransactionManager(scope),
  ) =>
    new SellSessionPackage(patients, procedures, transactions).execute({
      patientId: maria.id,
      procedureId: procedure.id,
      totalSessions: 10,
      priceCents,
    });

  it('Dado pacote pago, Quando vender, Então grava o pacote e uma fatura com o valor do pacote', async () => {
    const result = await sell(100000);

    const stored = await scope.sessionPackages.findByPatientId(maria.id);
    const invoices = await scope.invoices.findAll({ patientId: maria.id });
    expect(stored.map((p) => p.id)).toEqual([result.package.id]);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].amount.cents).toBe(100000);
    expect(invoices[0].description).toBe('Pacote: Curativo (10 sessões)');
    expect(result.procedureName).toBe('Curativo');
  });

  it('Dado pacote cortesia (preço zero), Quando vender, Então grava o pacote sem fatura', async () => {
    const result = await sell(0);

    expect(result.invoice).toBeNull();
    expect(await scope.sessionPackages.findByPatientId(maria.id)).toHaveLength(
      1,
    );
    expect(await scope.invoices.findAll({ patientId: maria.id })).toHaveLength(
      0,
    );
  });

  it('Dado paciente ou procedimento inexistente, Quando vender, Então NotFoundError e nada é gravado', async () => {
    await expect(
      new SellSessionPackage(
        patients,
        procedures,
        new NoTransactionManager(scope),
      ).execute({
        patientId: 'ghost',
        procedureId: procedure.id,
        totalSessions: 5,
        priceCents: 100,
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      new SellSessionPackage(
        patients,
        procedures,
        new NoTransactionManager(scope),
      ).execute({
        patientId: maria.id,
        procedureId: 'ghost',
        totalSessions: 5,
        priceCents: 100,
      }),
    ).rejects.toThrow(NotFoundError);

    expect(await scope.sessionPackages.findByPatientId(maria.id)).toHaveLength(
      0,
    );
  });

  it('Dado pacote inválido, Quando vender, Então falha antes de abrir a transação', async () => {
    let opened = false;
    const spy: TransactionManager = {
      run: (fn) => {
        opened = true;
        return fn(scope);
      },
    };

    await expect(
      new SellSessionPackage(patients, procedures, spy).execute({
        patientId: maria.id,
        procedureId: procedure.id,
        totalSessions: 0,
        priceCents: 100,
      }),
    ).rejects.toThrow(ValidationError);
    expect(opened).toBe(false);
  });

  it('Dado venda, Quando gravar, Então pacote e fatura passam pela mesma unidade de trabalho', async () => {
    const writes: string[] = [];
    const tracking: TransactionManager = {
      run: (fn) =>
        fn({
          ...scope,
          sessionPackages: Object.assign(Object.create(scope.sessionPackages), {
            save: async () => {
              writes.push('package');
            },
          }),
          invoices: Object.assign(Object.create(scope.invoices), {
            save: async () => {
              writes.push('invoice');
            },
          }),
        }),
    };

    await sell(5000, tracking);

    expect(writes).toEqual(['package', 'invoice']);
  });
});
