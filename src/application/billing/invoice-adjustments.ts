import type { Invoice, PaymentMethod } from '@/domain/billing/invoice';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import { NotFoundError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';

async function load(invoices: InvoiceRepository, id: string): Promise<Invoice> {
  const invoice = await invoices.findById(id);
  if (!invoice) {
    throw new NotFoundError('Fatura', id);
  }
  return invoice;
}

export interface RegisterInvoicePaymentInput {
  id: string;
  amountCents: number;
  method: PaymentMethod;
  paidAt?: Date;
}

/** Recebimento parcial (ou do saldo inteiro) de uma fatura pendente. */
export class RegisterInvoicePayment {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: RegisterInvoicePaymentInput): Promise<Invoice> {
    const invoice = await load(this.invoices, input.id);
    const updated = invoice.registerPayment({
      amount: Money.fromCents(input.amountCents),
      method: input.method,
      paidAt: input.paidAt,
    });
    await this.invoices.save(updated);
    return updated;
  }
}

export interface ApplyInvoiceDiscountInput {
  id: string;
  amountCents: number;
  reason: string;
}

/** Desconto com motivo em fatura pendente (substitui o anterior). */
export class ApplyInvoiceDiscount {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: ApplyInvoiceDiscountInput): Promise<Invoice> {
    const invoice = await load(this.invoices, input.id);
    const updated = invoice.applyDiscount(
      Money.fromCents(input.amountCents),
      input.reason,
    );
    await this.invoices.save(updated);
    return updated;
  }
}
