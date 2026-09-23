import { and, eq, gt, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  BillingRef,
  ProducedSession,
  ProducedSessionRepository,
} from '@/domain/billing/commission';
import type { InvoiceStatus } from '@/domain/billing/invoice';
import type { AppDb } from './db';
import {
  appointments,
  invoices,
  packageConsumptions,
  sessionPackages,
} from './schema';
import { withTenant } from './tenant-scope';

const packageInvoices = alias(invoices, 'package_invoices');

/** Paga > pendente > cancelada: uma consulta com fatura refeita usa a vigente. */
const STATUS_RANK: Record<InvoiceStatus, number> = {
  paid: 0,
  pending: 1,
  cancelled: 2,
};

const toBillingRef = (row: {
  status: string | null;
  issuedAt: Date | null;
  dueDate: Date | null;
}): BillingRef | null =>
  row.status && row.issuedAt
    ? {
        status: row.status as InvoiceStatus,
        issuedAt: row.issuedAt,
        dueDate: row.dueDate,
      }
    : null;

const preferred = (
  current: BillingRef | null,
  candidate: BillingRef | null,
): BillingRef | null => {
  if (!current) return candidate;
  if (!candidate) return current;
  return STATUS_RANK[candidate.status] < STATUS_RANK[current.status]
    ? candidate
    : current;
};

/**
 * Sessões concluídas no período com fatura da consulta e, quando coberta por
 * pacote, o pacote e a fatura da venda dele. Sem `MAX_ROWS`: o relatório
 * precisa de todas as sessões do mês — truncar em silêncio subestimaria
 * receita e repasse.
 */
export class DrizzleProducedSessionRepository
  implements ProducedSessionRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async findCompletedInRange(
    start: Date,
    end: Date,
    options: { professionalId?: string } = {},
  ): Promise<ProducedSession[]> {
    const rows = await this.db
      .select({
        appointmentId: appointments.id,
        professionalId: appointments.professionalId,
        procedure: appointments.procedure,
        sessionDate: appointments.startsAt,
        listPriceCents: appointments.priceCents,
        invoiceStatus: invoices.status,
        invoiceIssuedAt: invoices.issuedAt,
        invoiceDueDate: invoices.dueDate,
        packagePriceCents: sessionPackages.priceCents,
        packageTotalSessions: sessionPackages.totalSessions,
        packageInvoiceStatus: packageInvoices.status,
        packageInvoiceIssuedAt: packageInvoices.issuedAt,
        packageInvoiceDueDate: packageInvoices.dueDate,
      })
      .from(appointments)
      .leftJoin(invoices, eq(invoices.appointmentId, appointments.id))
      .leftJoin(
        packageConsumptions,
        eq(packageConsumptions.appointmentId, appointments.id),
      )
      .leftJoin(
        sessionPackages,
        eq(sessionPackages.id, packageConsumptions.packageId),
      )
      .leftJoin(
        packageInvoices,
        eq(packageInvoices.sessionPackageId, sessionPackages.id),
      )
      .where(
        withTenant(
          appointments,
          this.clinicId,
          and(
            eq(appointments.status, 'completed'),
            lt(appointments.startsAt, end),
            gt(appointments.endsAt, start),
            options.professionalId
              ? eq(appointments.professionalId, options.professionalId)
              : undefined,
          ),
        ),
      );

    const byAppointment = new Map<string, ProducedSession>();
    for (const row of rows) {
      const invoice = toBillingRef({
        status: row.invoiceStatus,
        issuedAt: row.invoiceIssuedAt,
        dueDate: row.invoiceDueDate,
      });
      const packageInvoice = toBillingRef({
        status: row.packageInvoiceStatus,
        issuedAt: row.packageInvoiceIssuedAt,
        dueDate: row.packageInvoiceDueDate,
      });
      const existing = byAppointment.get(row.appointmentId);
      if (existing) {
        existing.invoice = preferred(existing.invoice, invoice);
        if (existing.package) {
          existing.package.invoice = preferred(
            existing.package.invoice,
            packageInvoice,
          );
        }
        continue;
      }
      byAppointment.set(row.appointmentId, {
        appointmentId: row.appointmentId,
        professionalId: row.professionalId,
        procedure: row.procedure,
        sessionDate: row.sessionDate,
        listPriceCents: row.listPriceCents,
        invoice,
        package:
          row.packagePriceCents != null && row.packageTotalSessions != null
            ? {
                priceCents: row.packagePriceCents,
                totalSessions: row.packageTotalSessions,
                invoice: packageInvoice,
              }
            : null,
      });
    }
    return [...byAppointment.values()];
  }
}
