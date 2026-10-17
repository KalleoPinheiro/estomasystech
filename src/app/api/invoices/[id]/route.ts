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
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toInvoiceDto } from '@/lib/dto';

/** Pagador distinto do paciente (#326): nome e CPF juntos, ou nenhum dos dois. */
const payerShape = {
  payerName: z.string().max(200).nullish(),
  payerCpf: z.string().max(20).nullish(),
};

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('pay'),
    method: z.enum(PAYMENT_METHODS),
    ...payerShape,
  }),
  z.object({
    action: z.literal('pay_partial'),
    amountCents: z.number().int().positive().max(1_000_000_000),
    method: z.enum(PAYMENT_METHODS),
    paidAt: z.iso.datetime().optional(),
    ...payerShape,
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
    const { transactions, auditEvents } = await getRepositories(
      writeScope(guard.session),
    );
    // Ler (com lock da linha), aplicar a regra e gravar na mesma transação:
    // duas ações simultâneas na mesma fatura viram fila, e a segunda vê o
    // saldo já atualizado — nunca recebimento em dobro (#192).
    const updated = await transactions.run((tx) =>
      applyAction(tx.invoices, id, body),
    );
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

function toPayer(body: {
  payerName?: string | null;
  payerCpf?: string | null;
}): { name: string; cpf: string } | null {
  const name = body.payerName?.trim() ?? '';
  const cpf = body.payerCpf?.trim() ?? '';
  if (!name && !cpf) return null;
  if (!name || !cpf) {
    throw new ValidationError(
      'Informe nome e CPF do pagador, ou deixe os dois em branco',
    );
  }
  return { name, cpf };
}

function applyAction(
  invoices: InvoiceRepository,
  id: string,
  body: z.infer<typeof actionSchema>,
): Promise<Invoice> {
  switch (body.action) {
    case 'pay':
      return new PayInvoice(invoices).execute({
        id,
        method: body.method,
        payer: toPayer(body),
      });
    case 'pay_partial':
      return new RegisterInvoicePayment(invoices).execute({
        id,
        amountCents: body.amountCents,
        method: body.method,
        paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
        payer: toPayer(body),
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
