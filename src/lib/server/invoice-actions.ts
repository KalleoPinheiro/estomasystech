import { z } from 'zod';
import { CancelInvoice } from '@/application/billing/cancel-invoice';
import {
  ApplyInvoiceDiscount,
  RegisterInvoicePayment,
} from '@/application/billing/invoice-adjustments';
import { PayInvoice } from '@/application/billing/pay-invoice';
import { type Invoice, PAYMENT_METHODS } from '@/domain/billing/invoice';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import { ValidationError } from '@/domain/shared/errors';

/** Pagador distinto do paciente (#326): nome e CPF juntos, ou nenhum dos dois. */
const payerShape = {
  payerName: z.string().max(200).nullish(),
  payerCpf: z.string().max(20).nullish(),
};

/**
 * Ações sobre uma fatura (quitar, receber parte, desconto, cancelar): o mesmo
 * contrato do `PATCH /api/invoices/:id` e da Server Action da tela, para que as
 * duas entradas apliquem exatamente a mesma regra.
 */
export const invoiceActionSchema = z.discriminatedUnion('action', [
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

export type InvoiceAction = z.infer<typeof invoiceActionSchema>;

export const INVOICE_AUDIT_DETAIL: Record<InvoiceAction['action'], string> = {
  pay: 'quitada',
  pay_partial: 'pagamento parcial',
  discount: 'desconto',
  cancel: 'cancelada',
};

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

/**
 * Aplica a ação à fatura. O repositório deve ser o da TRANSAÇÃO: a leitura
 * trava a linha (`FOR UPDATE`), então duas ações simultâneas na mesma fatura
 * viram fila e a segunda vê o saldo já atualizado — nunca recebimento em
 * dobro (#192).
 */
export function applyInvoiceAction(
  invoices: InvoiceRepository,
  id: string,
  body: InvoiceAction,
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
