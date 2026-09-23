import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CancelInvoice } from '@/application/billing/cancel-invoice';
import {
  ApplyInvoiceDiscount,
  RegisterInvoicePayment,
} from '@/application/billing/invoice-adjustments';
import { PayInvoice } from '@/application/billing/pay-invoice';
import { type Invoice, PAYMENT_METHODS } from '@/domain/billing/invoice';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toInvoiceDto } from '@/lib/dto';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pay'), method: z.enum(PAYMENT_METHODS) }),
  z.object({
    action: z.literal('pay_partial'),
    amountCents: z.number().int().positive().max(1_000_000_000),
    method: z.enum(PAYMENT_METHODS),
    paidAt: z.iso.datetime().optional(),
  }),
  z.object({
    action: z.literal('discount'),
    amountCents: z.number().int().min(0).max(1_000_000_000),
    reason: z.string().max(200),
  }),
  z.object({ action: z.literal('cancel') }),
]);

const AUDIT_DETAIL: Record<z.infer<typeof actionSchema>['action'], string> = {
  pay: 'quitada',
  pay_partial: 'pagamento parcial',
  discount: 'desconto',
  cancel: 'cancelada',
};

/** Fatura com recebimentos — base do recibo. */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { invoices, patients } = await getRepositories(
      sessionScope(guard.session),
    );
    const invoice = await invoices.findById(id);
    if (!invoice) {
      throw new NotFoundError('Fatura', id);
    }
    const patient = await patients.findById(invoice.patientId);
    return toInvoiceDto(invoice, patient?.fullName);
  });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = actionSchema.parse(await request.json());
    const { invoices, auditEvents } = await getRepositories(
      writeScope(guard.session),
    );
    const updated = await applyAction(invoices, id, body);
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'invoice',
      resourceId: updated.id,
      patientId: updated.patientId,
      detail: AUDIT_DETAIL[body.action],
    });
    return toInvoiceDto(updated);
  });
}

function applyAction(
  invoices: InvoiceRepository,
  id: string,
  body: z.infer<typeof actionSchema>,
): Promise<Invoice> {
  switch (body.action) {
    case 'pay':
      return new PayInvoice(invoices).execute({ id, method: body.method });
    case 'pay_partial':
      return new RegisterInvoicePayment(invoices).execute({
        id,
        amountCents: body.amountCents,
        method: body.method,
        paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
      });
    case 'discount':
      return new ApplyInvoiceDiscount(invoices).execute({
        id,
        amountCents: body.amountCents,
        reason: body.reason,
      });
    case 'cancel':
      return new CancelInvoice(invoices).execute({ id });
  }
}
