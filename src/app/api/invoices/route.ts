import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateInvoice } from '@/application/billing/create-invoice';
import { INVOICE_STATUSES } from '@/domain/billing/invoice';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toInvoiceDto } from '@/lib/dto';
import { listInvoicesFor } from '@/lib/server/data/invoices';

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

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  // O cursor sai da mesma leitura que monta a página; fica numa variável de
  // fora porque o `meta` só é montado depois de o action resolver.
  let nextCursor: string | null = null;

  return handleRequest(
    async () => {
      const params = request.nextUrl.searchParams;
      const from = params.get('from');
      const to = params.get('to');
      const parsedPage = paginationSchema.parse({
        limit: params.get('limit') ?? undefined,
        cursor: params.get('cursor') ?? undefined,
      });
      const page = await listInvoicesFor(guard.session, {
        status: statusSchema.parse(params.get('status') ?? undefined),
        patientId: params.get('patientId') ?? undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        limit: parsedPage.limit,
        cursor: parsedPage.cursor,
      });
      nextCursor = page.nextCursor;
      return page.invoices;
    },
    () => ({ nextCursor }),
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
