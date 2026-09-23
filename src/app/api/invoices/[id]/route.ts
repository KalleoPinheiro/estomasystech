import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CancelInvoice } from '@/application/billing/cancel-invoice';
import { PayInvoice } from '@/application/billing/pay-invoice';
import { PAYMENT_METHODS } from '@/domain/billing/invoice';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toInvoiceDto } from '@/lib/dto';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pay'), method: z.enum(PAYMENT_METHODS) }),
  z.object({ action: z.literal('cancel') }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = actionSchema.parse(await request.json());
    const { invoices } = await getRepositories(writeScope(guard.session));

    if (body.action === 'pay') {
      return toInvoiceDto(
        await new PayInvoice(invoices).execute({ id, method: body.method }),
      );
    }
    return toInvoiceDto(await new CancelInvoice(invoices).execute({ id }));
  });
}
