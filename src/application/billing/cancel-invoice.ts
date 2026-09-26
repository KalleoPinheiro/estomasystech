import type { Invoice } from '@/domain/billing/invoice';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import { NotFoundError } from '@/domain/shared/errors';

export class CancelInvoice {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: { id: string }): Promise<Invoice> {
    const invoice = await this.invoices.findByIdForUpdate(input.id);
    if (!invoice) {
      throw new NotFoundError('Fatura', input.id);
    }
    const cancelled = invoice.cancel();
    await this.invoices.save(cancelled);
    return cancelled;
  }
}
