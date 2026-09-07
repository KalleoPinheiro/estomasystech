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
});
