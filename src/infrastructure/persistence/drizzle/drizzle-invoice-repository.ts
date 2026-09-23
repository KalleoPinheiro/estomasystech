import { and, desc, eq, gte, lt, or, type SQL, sql } from 'drizzle-orm';
import {
  Invoice,
  type InvoiceStatus,
  type PaymentMethod,
} from '@/domain/billing/invoice';
import type {
  InvoiceFilter,
  InvoicePage,
  InvoiceRepository,
  InvoiceSummary,
} from '@/domain/billing/invoice-repository';
import { Money } from '@/domain/shared/money';
import { decodeCursor } from '@/lib/pagination';
import { type AppDb, MAX_ROWS } from './db';
import { invoices } from './schema';
import { withTenant } from './tenant-scope';

type InvoiceRow = typeof invoices.$inferSelect;

const toInvoice = (row: InvoiceRow): Invoice =>
  Invoice.restore({
    id: row.id,
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    sessionPackageId: row.sessionPackageId,
    description: row.description,
    amount: Money.fromCents(row.amountCents),
    status: row.status as InvoiceStatus,
    issuedAt: row.issuedAt,
    dueDate: row.dueDate,
    paidAt: row.paidAt,
    paymentMethod: row.paymentMethod as PaymentMethod | null,
  });

export class DrizzleInvoiceRepository implements InvoiceRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(invoice: Invoice): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar fatura (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: invoice.id,
      clinicId: this.clinicId,
      patientId: invoice.patientId,
      appointmentId: invoice.appointmentId,
      sessionPackageId: invoice.sessionPackageId,
      description: invoice.description,
      amountCents: invoice.amount.cents,
      status: invoice.status,
      issuedAt: invoice.issuedAt,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      paymentMethod: invoice.paymentMethod,
    };
    await this.db
      .insert(invoices)
      .values(values)
      .onConflictDoUpdate({ target: invoices.id, set: values });
  }

  async findById(id: string): Promise<Invoice | null> {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(withTenant(invoices, this.clinicId, eq(invoices.id, id)))
      .limit(1);
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  async findByAppointmentId(appointmentId: string): Promise<Invoice | null> {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(
        withTenant(
          invoices,
          this.clinicId,
          eq(invoices.appointmentId, appointmentId),
        ),
      )
      .limit(1);
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  private buildConditions(filter: InvoiceFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(invoices.status, filter.status));
    if (filter.patientId)
      conditions.push(eq(invoices.patientId, filter.patientId));
    if (filter.from) conditions.push(gte(invoices.issuedAt, filter.from));
    if (filter.to) conditions.push(lt(invoices.issuedAt, filter.to));
    return withTenant(
      invoices,
      this.clinicId,
      conditions.length > 0 ? and(...conditions) : undefined,
    );
  }

  async findAll(
    filter: InvoiceFilter = {},
    page: InvoicePage = {},
  ): Promise<Invoice[]> {
    const limit = Math.min(page.limit ?? MAX_ROWS, MAX_ROWS);
    const rows = await this.db
      .select()
      .from(invoices)
      .where(
        and(
          this.buildConditions(filter),
          buildInvoiceCursorFilter(page.cursor),
        ),
      )
      .orderBy(desc(invoices.issuedAt), desc(invoices.id))
      .limit(limit);
    return rows.map(toInvoice);
  }

  async summarize(filter: InvoiceFilter = {}): Promise<InvoiceSummary> {
    const paid = sql`${invoices.status} = 'paid'`;
    const pending = sql`${invoices.status} = 'pending'`;
    const cancelled = sql`${invoices.status} = 'cancelled'`;
    const [row] = await this.db
      .select({
        paidCents: sql<number>`coalesce(sum(${invoices.amountCents}) filter (where ${paid}), 0)`,
        pendingCents: sql<number>`coalesce(sum(${invoices.amountCents}) filter (where ${pending}), 0)`,
        totalInvoices: sql<number>`count(*)::int`,
        paidCount: sql<number>`(count(*) filter (where ${paid}))::int`,
        pendingCount: sql<number>`(count(*) filter (where ${pending}))::int`,
        cancelledCount: sql<number>`(count(*) filter (where ${cancelled}))::int`,
      })
      .from(invoices)
      .where(this.buildConditions(filter));
    return {
      paidCents: Number(row.paidCents),
      pendingCents: Number(row.pendingCents),
      totalInvoices: Number(row.totalInvoices),
      paidCount: Number(row.paidCount),
      pendingCount: Number(row.pendingCount),
      cancelledCount: Number(row.cancelledCount),
    };
  }
}

/** Predicado de keyset: retoma estritamente depois de (issuedAt, id) do cursor, ordem desc. */
function buildInvoiceCursorFilter(cursor?: string) {
  const decoded = decodeCursor<{ issuedAt: string; id: string }>(cursor);
  if (!decoded) return undefined;
  const issuedAt = new Date(decoded.issuedAt);
  return or(
    lt(invoices.issuedAt, issuedAt),
    and(eq(invoices.issuedAt, issuedAt), lt(invoices.id, decoded.id)),
  );
}
