import { describe, expect, it } from 'vitest';
import { ResolveReceipt } from '@/application/billing/resolve-receipt';
import { RegisterStockMovement } from '@/application/inventory/register-stock-movement';
import { Invoice } from '@/domain/billing/invoice';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { Supply } from '@/domain/inventory/supply';
import { Patient } from '@/domain/patient/patient';
import { NotFoundError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import {
  InMemoryStockMovementRepository,
  InMemorySupplyBatchRepository,
  InMemorySupplyRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

describe('Feature: Recibo exige paciente e empresa cadastrados (#326)', () => {
  const setup = async (patientExists: boolean) => {
    const invoices = new InMemoryInvoiceRepository();
    const patients = new InMemoryPatientRepository();
    const maria = Patient.create({
      fullName: 'Maria da Silva',
      phone: '11999990000',
    });
    if (patientExists) await patients.save(maria);
    const invoice = Invoice.create({
      patientId: maria.id,
      description: 'Curativo',
      amount: Money.fromCents(15000),
    }).registerPayment({ amount: Money.fromCents(15000), method: 'pix' });
    await invoices.save(invoice);
    return { invoices, patients, invoice };
  };
  const semEmpresa = {
    findById: async () => null,
  } as unknown as ClinicRepository;

  it('Dado fatura de paciente que não existe mais, Quando resolver o recibo, Então recusa com paciente não encontrado', async () => {
    const { invoices, patients, invoice } = await setup(false);

    await expect(
      new ResolveReceipt(invoices, patients, semEmpresa).execute({
        invoiceId: invoice.id,
        paymentId: invoice.payments[0].id,
        clinicId: 'c-1',
      }),
    ).rejects.toThrow(new NotFoundError('Paciente', invoice.patientId));
  });

  it('Dado empresa sem cadastro, Quando resolver o recibo, Então recusa com empresa não encontrada', async () => {
    const { invoices, patients, invoice } = await setup(true);

    await expect(
      new ResolveReceipt(invoices, patients, semEmpresa).execute({
        invoiceId: invoice.id,
        paymentId: invoice.payments[0].id,
        clinicId: 'c-1',
      }),
    ).rejects.toThrow(new NotFoundError('Empresa', 'c-1'));
  });
});

describe('Feature: Lotes do estoque, validade mais próxima primeiro (FEFO)', () => {
  const setup = async () => {
    const supplies = new InMemorySupplyRepository();
    const movements = new InMemoryStockMovementRepository();
    const batches = new InMemorySupplyBatchRepository();
    const supply = Supply.create({
      name: 'Bolsa colostomia 60mm',
      unit: 'un',
      minQty: 1,
      priceCents: 3500,
    });
    await supplies.save(supply);
    const useCase = new RegisterStockMovement(
      supplies,
      movements,
      undefined,
      batches,
    );
    return { supply, batches, useCase };
  };

  it('Dado entradas só com rótulo e só com validade, Quando registrar, Então cada uma cria o seu lote', async () => {
    const { supply, batches, useCase } = await setup();
    await useCase.execute({
      supplyId: supply.id,
      type: 'in',
      quantity: 5,
      reason: 'Compra',
      batchLabel: 'L-100',
    });
    await useCase.execute({
      supplyId: supply.id,
      type: 'in',
      quantity: 5,
      reason: 'Compra',
      expiresAt: new Date('2027-01-31T00:00:00Z'),
    });

    const ativos = await batches.findActiveBySupplyId(supply.id);
    expect(
      ativos.map((b) => [b.label, b.expiresAt?.toISOString() ?? null]),
    ).toEqual(
      expect.arrayContaining([
        ['L-100', null],
        [null, '2027-01-31T00:00:00.000Z'],
      ]),
    );
  });

  it('Dado dois lotes e uma saída que esgota o de validade mais próxima, Quando registrar, Então o segundo lote permanece intacto', async () => {
    const { supply, batches, useCase } = await setup();
    await useCase.execute({
      supplyId: supply.id,
      type: 'in',
      quantity: 5,
      reason: 'Compra A',
      batchLabel: 'A',
      expiresAt: new Date('2026-12-01T00:00:00Z'),
    });
    await useCase.execute({
      supplyId: supply.id,
      type: 'in',
      quantity: 5,
      reason: 'Compra B',
      batchLabel: 'B',
      expiresAt: new Date('2027-06-01T00:00:00Z'),
    });

    await useCase.execute({
      supplyId: supply.id,
      type: 'out',
      quantity: 5,
      reason: 'Uso',
    });

    const ativos = await batches.findActiveBySupplyId(supply.id);
    expect(ativos.map((b) => [b.label, b.remaining])).toEqual([['B', 5]]);
  });
});
