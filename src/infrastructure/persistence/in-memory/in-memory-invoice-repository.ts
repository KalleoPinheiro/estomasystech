import type { Invoice } from '@/domain/billing/invoice';
import type {
  InvoiceFilter,
  InvoicePage,
  InvoiceRepository,
  InvoiceSummary,
} from '@/domain/billing/invoice-repository';
import { decodeCursor } from '@/lib/pagination';

export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly invoices = new Map<string, Invoice>();

  async save(invoice: Invoice): Promise<void> {
    this.invoices.set(invoice.id, invoice);
  }

  /** Todas as faturas (sem paginação) — usado pela leitura de produção em memória. */
  all(): Invoice[] {
    return [...this.invoices.values()];
  }

  async findById(id: string): Promise<Invoice | null> {
    return this.invoices.get(id) ?? null;
  }

  /** Memória não tem concorrência entre processos — igual a `findById`. */
  findByIdForUpdate(id: string): Promise<Invoice | null> {
    return this.findById(id);
  }

  async findByAppointmentId(appointmentId: string): Promise<Invoice | null> {
    return (
      [...this.invoices.values()].find(
        (i) => i.appointmentId === appointmentId,
      ) ?? null
    );
  }

  private matchesFilter(invoice: Invoice, filter?: InvoiceFilter): boolean {
    if (!filter) {
      return true;
    }
    if (filter.status && invoice.status !== filter.status) return false;
    if (filter.patientId && invoice.patientId !== filter.patientId)
      return false;
    if (filter.from && invoice.issuedAt.getTime() < filter.from.getTime())
      return false;
    if (filter.to && invoice.issuedAt.getTime() >= filter.to.getTime())
      return false;
    return true;
  }

  async findAll(
    filter?: InvoiceFilter,
    page: InvoicePage = {},
  ): Promise<Invoice[]> {
    const all = [...this.invoices.values()]
      .filter((invoice) => this.matchesFilter(invoice, filter))
      .sort(
        (a, b) =>
          b.issuedAt.getTime() - a.issuedAt.getTime() ||
          b.id.localeCompare(a.id),
      );
    const decoded = decodeCursor<{ issuedAt: string; id: string }>(page.cursor);
    // Mesmo comparador do sort acima (localeCompare no id) — `<` usaria ordem
    // UTF-16 e poderia divergir do sort em ids com caracteres não-ASCII.
    const afterCursor = decoded
      ? all.filter((invoice) => {
          const issuedAt = invoice.issuedAt.getTime();
          const cursorIssuedAt = new Date(decoded.issuedAt).getTime();
          if (issuedAt !== cursorIssuedAt) return issuedAt < cursorIssuedAt;
          return invoice.id.localeCompare(decoded.id) < 0;
        })
      : all;
    return page.limit != null ? afterCursor.slice(0, page.limit) : afterCursor;
  }

  async summarize(filter?: InvoiceFilter): Promise<InvoiceSummary> {
    const matching = [...this.invoices.values()].filter((invoice) =>
      this.matchesFilter(invoice, filter),
    );
    return matching.reduce<InvoiceSummary>(
      (summary, invoice) => ({
        paidCents:
          summary.paidCents +
          (invoice.status === 'cancelled' ? 0 : invoice.paid.cents),
        pendingCents:
          summary.pendingCents +
          (invoice.status === 'pending' ? invoice.balance.cents : 0),
        totalInvoices: summary.totalInvoices + 1,
        paidCount: summary.paidCount + (invoice.status === 'paid' ? 1 : 0),
        pendingCount:
          summary.pendingCount + (invoice.status === 'pending' ? 1 : 0),
        cancelledCount:
          summary.cancelledCount + (invoice.status === 'cancelled' ? 1 : 0),
      }),
      {
        paidCents: 0,
        pendingCents: 0,
        totalInvoices: 0,
        paidCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
      },
    );
  }
}
