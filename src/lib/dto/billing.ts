import type { Invoice } from '@/domain/billing/invoice';

export interface InvoiceDto {
  id: string;
  patientId: string;
  patientName?: string;
  appointmentId: string | null;
  description: string;
  amountCents: number;
  status: string;
  issuedAt: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  discountCents: number;
  discountReason: string | null;
  /** Valor menos desconto. */
  netAmountCents: number;
  /** Total recebido (parciais incluídos). */
  paidCents: number;
  /** Saldo a receber (zero se paga ou cancelada). */
  balanceCents: number;
  payments: InvoicePaymentDto[];
}

export interface InvoicePaymentDto {
  id: string;
  amountCents: number;
  method: string;
  paidAt: string;
}

export const toInvoiceDto = (
  invoice: Invoice,
  patientName?: string,
): InvoiceDto => ({
  id: invoice.id,
  patientId: invoice.patientId,
  patientName,
  appointmentId: invoice.appointmentId,
  description: invoice.description,
  amountCents: invoice.amount.cents,
  status: invoice.status,
  issuedAt: invoice.issuedAt.toISOString(),
  dueDate: invoice.dueDate?.toISOString() ?? null,
  paidAt: invoice.paidAt?.toISOString() ?? null,
  paymentMethod: invoice.paymentMethod,
  discountCents: invoice.discount?.amount.cents ?? 0,
  discountReason: invoice.discount?.reason ?? null,
  netAmountCents: invoice.netAmount.cents,
  paidCents: invoice.paid.cents,
  balanceCents: invoice.balance.cents,
  payments: invoice.payments.map((payment) => ({
    id: payment.id,
    amountCents: payment.amount.cents,
    method: payment.method,
    paidAt: payment.paidAt.toISOString(),
  })),
});
