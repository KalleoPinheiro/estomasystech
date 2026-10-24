import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateInvoice } from '@/application/billing/create-invoice';
import { ListInvoices } from '@/application/billing/list-invoices';
import { INVOICE_STATUSES } from '@/domain/billing/invoice';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import type { InvoiceDto } from '@/lib/dto';
import { toInvoiceDto } from '@/lib/dto';
import { encodeCursor } from '@/lib/pagination';

const createInvoiceSchema = z.object({
  patientId: z.string().min(1),
  description: z.string().min(1).max(500),
  amountCents: z.number().int().positive().max(1_000_000_000),
  appointmentId: z.string().nullish(),
  dueDate: z.iso.datetime().nullish(),
});

const statusSchema = z.enum(INVOICE_STATUSES).optional();

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

/** Cursor opaco pela mesma ordenação da query (issuedAt desc, id desc) — issue #75. */
function nextInvoiceCursor(page: InvoiceDto[], limit: number): string | null {
  if (page.length < limit) return null;
  const last = page[page.length - 1];
  return encodeCursor({ issuedAt: last.issuedAt, id: last.id });
}

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  // `limit` some fora do try/catch do handleRequest (usado no buildMeta, que só
  // roda depois do action resolver) — por isso fica numa variável de fora,
  // atribuída dentro do action para que erros de zod ainda virem 400.
  let limit = 0;

  return handleRequest(
    async () => {
      const params = request.nextUrl.searchParams;
      const status = statusSchema.parse(params.get('status') ?? undefined);
      const from = params.get('from');
      const to = params.get('to');
      const patientId = params.get('patientId') ?? undefined;
      const parsedPage = paginationSchema.parse({
        limit: params.get('limit') ?? undefined,
        cursor: params.get('cursor') ?? undefined,
      });
      limit = parsedPage.limit;

      const { invoices, patients } = await getRepositories(
        sessionScope(guard.session),
      );
      const result = await new ListInvoices(invoices, patients).execute(
        {
          status,
          patientId,
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
        },
        { limit, cursor: parsedPage.cursor },
      );
      return result.map(({ invoice, patientName, patientBirthDate }) =>
        toInvoiceDto(invoice, patientName, patientBirthDate),
      );
    },
    (result) => ({ nextCursor: nextInvoiceCursor(result, limit) }),
  );
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = createInvoiceSchema.parse(await request.json());
    const { invoices, patients } = await getRepositories(
      writeScope(guard.session),
    );
    const invoice = await new CreateInvoice(invoices, patients).execute({
      patientId: body.patientId,
      description: body.description,
      amountCents: body.amountCents,
      appointmentId: body.appointmentId ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    });
    return toInvoiceDto(invoice);
  });
}
