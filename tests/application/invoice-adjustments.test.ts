import { describe, expect, it } from 'vitest';
import {
  ApplyInvoiceDiscount,
  RegisterInvoicePayment,
} from '@/application/billing/invoice-adjustments';
import { Invoice } from '@/domain/billing/invoice';
import { NotFoundError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';

describe('Feature: Ajustes de fatura (casos de uso)', () => {
  it('Dado fatura salva, Quando receber parcial e dar desconto, Então persiste e o resumo usa recebido e saldo', async () => {
    const invoices = new InMemoryInvoiceRepository();
    const invoice = Invoice.create({
      patientId: 'pat-1',
      description: 'Curativo',
      amount: Money.fromCents(20000),
    });
    await invoices.save(invoice);

    await new ApplyInvoiceDiscount(invoices).execute({
      id: invoice.id,
      amountCents: 2000,
      reason: 'Fidelidade',
    });
    const paid = await new RegisterInvoicePayment(invoices).execute({
      id: invoice.id,
      amountCents: 5000,
      method: 'pix',
    });

    expect(paid.balance.cents).toBe(13000);
    expect((await invoices.findById(invoice.id))?.paid.cents).toBe(5000);
    const summary = await invoices.summarize();
    expect(summary.paidCents).toBe(5000);
    expect(summary.pendingCents).toBe(13000);
  });

  it('Dado fatura inexistente, Quando receber ou dar desconto, Então NotFound', async () => {
    const invoices = new InMemoryInvoiceRepository();
    await expect(
      new RegisterInvoicePayment(invoices).execute({
        id: 'x',
        amountCents: 100,
        method: 'pix',
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      new ApplyInvoiceDiscount(invoices).execute({
        id: 'x',
        amountCents: 100,
        reason: 'y',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
