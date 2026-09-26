import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import {
  Invoice,
  type InvoicePayment,
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
import { invoicePayments, invoices } from './schema';
import { withTenant } from './tenant-scope';

type InvoiceRow = typeof invoices.$inferSelect;
type PaymentRow = typeof invoicePayments.$inferSelect;

const toPayment = (row: PaymentRow): InvoicePayment => ({
  id: row.id,
  amount: Money.fromCents(row.amountCents),
  method: row.method as PaymentMethod,
  paidAt: row.paidAt,
});

const toInvoice = (row: InvoiceRow, payments: PaymentRow[] = []): Invoice =>
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
    discount:
      row.discountCents > 0
        ? {
            amount: Money.fromCents(row.discountCents),
            reason: row.discountReason ?? '',
          }
        : null,
    payments: payments.map(toPayment),
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
      discountCents: invoice.discount?.amount.cents ?? 0,
      discountReason: invoice.discount?.reason ?? null,
    };
    // Fatura e recebimentos gravam juntos ou nada grava (#192); dentro de uma
    // transação externa vira savepoint.
    await this.db.transaction(async (tx) => {
      await tx
        .insert(invoices)
        .values(values)
        .onConflictDoUpdate({ target: invoices.id, set: values });
      await this.insertNewPayments(tx, invoice);
    });
  }

  /** Recebimentos são imutáveis: só os novos entram. */
  private async insertNewPayments(tx: AppDb, invoice: Invoice): Promise<void> {
    const payments = invoice.payments;
    if (payments.length > 0) {
      await tx
        .insert(invoicePayments)
        .values(
          payments.map((payment) => ({
            id: payment.id,
            clinicId: this.clinicId as string,
            invoiceId: invoice.id,
            amountCents: payment.amount.cents,
            method: payment.method,
            paidAt: payment.paidAt,
          })),
        )
        .onConflictDoNothing({ target: invoicePayments.id });
    }
  }

  /** Recebimentos das faturas, em lote (sem N+1), por ordem de data. */
  private async withPayments(rows: InvoiceRow[]): Promise<Invoice[]> {
    if (rows.length === 0) {
      return [];
    }
    const paymentRows = await this.db
      .select()
      .from(invoicePayments)
      .where(
        inArray(
          invoicePayments.invoiceId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(invoicePayments.paidAt), asc(invoicePayments.id));
    const byInvoice = new Map<string, PaymentRow[]>();
    for (const payment of paymentRows) {
      byInvoice.set(payment.invoiceId, [
        ...(byInvoice.get(payment.invoiceId) ?? []),
        payment,
      ]);
    }
    return rows.map((row) => toInvoice(row, byInvoice.get(row.id)));
  }

  async findById(id: string): Promise<Invoice | null> {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(withTenant(invoices, this.clinicId, eq(invoices.id, id)))
      .limit(1);
    return (await this.withPayments(rows))[0] ?? null;
  }

  async findByIdForUpdate(id: string): Promise<Invoice | null> {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(withTenant(invoices, this.clinicId, eq(invoices.id, id)))
      .limit(1)
      .for('update');
    return (await this.withPayments(rows))[0] ?? null;
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
    return (await this.withPayments(rows))[0] ?? null;
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
    return this.withPayments(rows);
  }

  /**
   * Recebido = soma dos recebimentos (inclui parciais de faturas ainda
   * pendentes); a receber = saldo das pendentes (líquido do desconto menos o já
   * recebido).
   */
  async summarize(filter: InvoiceFilter = {}): Promise<InvoiceSummary> {
    const paid = sql`${invoices.status} = 'paid'`;
    const pending = sql`${invoices.status} = 'pending'`;
    const cancelled = sql`${invoices.status} = 'cancelled'`;
    const received = sql`coalesce((select sum(${invoicePayments.amountCents}) from ${invoicePayments} where ${invoicePayments.invoiceId} = ${invoices.id}), 0)`;
    const [row] = await this.db
      .select({
        paidCents: sql<number>`coalesce(sum(${received}) filter (where not ${cancelled}), 0)`,
        pendingCents: sql<number>`coalesce(sum(${invoices.amountCents} - ${invoices.discountCents} - ${received}) filter (where ${pending}), 0)`,
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
