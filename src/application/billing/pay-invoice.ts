import type { Invoice, PaymentMethod } from '@/domain/billing/invoice';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import { NotFoundError } from '@/domain/shared/errors';

export interface PayInvoiceInput {
  id: string;
  method: PaymentMethod;
  paidAt?: Date;
  payer?: { name: string; cpf: string } | null;
}

export class PayInvoice {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: PayInvoiceInput): Promise<Invoice> {
    const invoice = await this.invoices.findByIdForUpdate(input.id);
    if (!invoice) {
      throw new NotFoundError('Fatura', input.id);
    }
    const paid = invoice.markPaid(input.method, input.paidAt, input.payer);
    await this.invoices.save(paid);
    return paid;
  }
}
