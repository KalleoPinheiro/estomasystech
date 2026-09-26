import { describe, expect, it, vi } from 'vitest';
import { CancelInvoice } from '@/application/billing/cancel-invoice';
import {
  ApplyInvoiceDiscount,
  RegisterInvoicePayment,
} from '@/application/billing/invoice-adjustments';
import { PayInvoice } from '@/application/billing/pay-invoice';
import { Invoice } from '@/domain/billing/invoice';
import { Money } from '@/domain/shared/money';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';

/** Issue #192: toda ação na fatura lê com lock (findByIdForUpdate), nunca findById. */
describe('Ações da fatura leem com lock (#192)', () => {
  const setup = async () => {
    const repo = new InMemoryInvoiceRepository();
    const invoice = Invoice.create({
      patientId: 'pat-1',
      description: 'Curativo',
      amount: Money.fromCents(10000),
    });
    await repo.save(invoice);
    const locked = vi.spyOn(repo, 'findByIdForUpdate');
    return { repo, id: invoice.id, locked };
  };

  it.each([
    [
      'pagar',
      (r: InMemoryInvoiceRepository, id: string) =>
        new PayInvoice(r).execute({ id, method: 'pix' }),
    ],
    [
      'pagamento parcial',
      (r: InMemoryInvoiceRepository, id: string) =>
        new RegisterInvoicePayment(r).execute({
          id,
          amountCents: 5000,
          method: 'pix',
        }),
    ],
    [
      'desconto',
      (r: InMemoryInvoiceRepository, id: string) =>
        new ApplyInvoiceDiscount(r).execute({
          id,
          amountCents: 1000,
          reason: 'fidelidade',
        }),
    ],
    [
      'cancelar',
      (r: InMemoryInvoiceRepository, id: string) =>
        new CancelInvoice(r).execute({ id }),
    ],
  ])('%s lê a fatura com findByIdForUpdate', async (_name, act) => {
    const { repo, id, locked } = await setup();

    await act(repo, id);

    expect(locked).toHaveBeenCalledWith(id);
  });
});
