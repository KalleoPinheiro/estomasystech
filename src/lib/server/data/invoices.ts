import 'server-only';
import { GetInvoicesSummary } from '@/application/billing/get-invoices-summary';
import { ListInvoices } from '@/application/billing/list-invoices';
import type { InvoiceStatus } from '@/domain/billing/invoice';
import type { InvoiceSummary } from '@/domain/billing/invoice-repository';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type InvoiceDto, toInvoiceDto } from '@/lib/dto';
import { encodeCursor } from '@/lib/pagination';

/** Tamanho da página de faturas: o mesmo da API e da tela. */
export const INVOICE_PAGE_SIZE = 100;

export interface InvoiceQuery {
  status?: InvoiceStatus;
  patientId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  /** Cursor opaco (issue #75) devolvido pela página anterior. */
  cursor?: string;
}

export interface InvoicePageResult {
  invoices: InvoiceDto[];
  /** `null` quando a página veio incompleta, ou seja, não há mais faturas. */
  nextCursor: string | null;
}

/** Cursor opaco pela mesma ordenação da query (issuedAt desc, id desc) — issue #75. */
function nextInvoiceCursor(page: InvoiceDto[], limit: number): string | null {
  if (page.length < limit) return null;
  const last = page[page.length - 1];
  return encodeCursor({ issuedAt: last.issuedAt, id: last.id });
}

/**
 * Faturas da empresa da sessão, mais recentes primeiro. Mesma resposta de
 * `GET /api/invoices`, que reaproveita esta função, e fonte da lista da tela
 * de Faturamento: um só lugar monta o DTO (ADR-074 § 3).
 */
export async function listInvoicesFor(
  session: Session,
  query: InvoiceQuery = {},
): Promise<InvoicePageResult> {
  const limit = query.limit ?? INVOICE_PAGE_SIZE;
  const { invoices, patients } = await getRepositories(sessionScope(session));
  const result = await new ListInvoices(invoices, patients).execute(
    {
      status: query.status,
      patientId: query.patientId,
      from: query.from,
      to: query.to,
    },
    { limit, cursor: query.cursor },
  );
  const page = result.map(({ invoice, patientName, patientBirthDate }) =>
    toInvoiceDto(invoice, patientName, patientBirthDate),
  );
  return { invoices: page, nextCursor: nextInvoiceCursor(page, limit) };
}

/** Totais recebido e a receber da empresa: agregação no banco, `GET /api/invoices/summary`. */
export async function getInvoiceSummaryFor(
  session: Session,
): Promise<InvoiceSummary> {
  const { invoices } = await getRepositories(sessionScope(session));
  return new GetInvoicesSummary(invoices).execute();
}
