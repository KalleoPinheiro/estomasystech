'use client';

import { Table, TableBody, TableCell, TableRow } from '@still-void/ui/react';
import { type ReactNode, use } from 'react';
import { type ClinicInfoDto, DocumentFrame } from '@/components/document-frame';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import type { InvoiceDto, InvoicePaymentDto } from '@/lib/dto';
import {
  formatCurrency,
  formatDate,
  PAYMENT_METHOD_LABELS,
} from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import {
  type DocumentIssuance,
  useDocumentIssuance,
} from '@/lib/use-document-issuance';

/** Guardas de bloqueio/carregamento — mesma ordem dos demais documentos. */
function guardBlock(
  clinic: ClinicInfoDto | null,
  invoice: InvoiceDto | null,
  payment: InvoicePaymentDto | null,
  error: string | null,
  issuance: DocumentIssuance | null,
): ReactNode | null {
  if (error) return <ErrorAlert message={error} />;
  if (!clinic || !invoice) return <LoadingIndicator />;
  if (!payment) {
    return <ErrorAlert message="Pagamento não encontrado nesta fatura." />;
  }
  if (!isClinicInfoComplete(clinic)) {
    return (
      <ErrorAlert message="Clínica sem CNPJ ou responsável técnico cadastrados — cadastre em Configurações antes de emitir este documento." />
    );
  }
  // Sem emissão persistida, não renderiza: a data do rodapé nunca é `new Date()`.
  if (!issuance) return <LoadingIndicator />;
  return null;
}

/** Recebido até este pagamento, inclusive (os pagamentos vêm em ordem de data). */
function receivedUpTo(invoice: InvoiceDto, payment: InvoicePaymentDto): number {
  const index = invoice.payments.findIndex((p) => p.id === payment.id);
  return invoice.payments
    .slice(0, index + 1)
    .reduce((sum, p) => sum + p.amountCents, 0);
}

function Summary({
  invoice,
  payment,
}: {
  invoice: InvoiceDto;
  payment: InvoicePaymentDto;
}) {
  const received = receivedUpTo(invoice, payment);
  const remaining = Math.max(invoice.netAmountCents - received, 0);
  const rows: [string, string][] = [
    ['Valor da fatura', formatCurrency(invoice.amountCents)],
    ...(invoice.discountCents > 0
      ? ([
          [
            `Desconto${invoice.discountReason ? ` (${invoice.discountReason})` : ''}`,
            `− ${formatCurrency(invoice.discountCents)}`,
          ],
        ] as [string, string][])
      : []),
    ['Total a pagar', formatCurrency(invoice.netAmountCents)],
    ['Recebido até este recibo', formatCurrency(received)],
    ['Saldo restante', formatCurrency(remaining)],
  ];
  return (
    <Table className="mb-4 w-full border-collapse text-black text-xs">
      <TableBody>
        {rows.map(([label, value]) => (
          <TableRow key={label} className="border-black/30 border-b">
            <TableCell className="py-1 pr-2">{label}</TableCell>
            <TableCell className="py-1 text-right">{value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Recibo de um pagamento (total ou parcial) de fatura: o que foi recebido,
 * quando e como, e quanto ainda falta. Emissão persistida (`REC-…`).
 */
export default function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ invoiceId: string; paymentId: string }>;
}) {
  const { invoiceId, paymentId } = use(params);
  const { data: clinic, error: clinicError } =
    useApiQuery<ClinicInfoDto>('/api/clinic-info');
  const { data: invoice, error: invoiceError } = useApiQuery<InvoiceDto>(
    `/api/invoices/${invoiceId}`,
  );
  const { issuance, error: issuanceError } = useDocumentIssuance(
    'recibo',
    paymentId,
  );
  const payment = invoice?.payments.find((p) => p.id === paymentId) ?? null;

  const guard = guardBlock(
    clinic,
    invoice,
    payment,
    clinicError ?? invoiceError ?? issuanceError,
    issuance,
  );
  if (guard) return guard;
  if (!clinic || !invoice || !payment || !issuance) return null;

  const settles = receivedUpTo(invoice, payment) >= invoice.netAmountCents;
  return (
    <DocumentFrame
      clinic={clinic}
      title="Recibo"
      documentNumber={issuance.documentNumber}
      issuedAt={issuance.issuedAt}
      footerNote={
        settles
          ? 'Este pagamento quita a fatura.'
          : 'Pagamento parcial: a fatura continua em aberto pelo saldo restante.'
      }
    >
      <p className="mb-4">
        {clinic.name} recebeu de <strong>{invoice.patientName}</strong> a
        quantia de <strong>{formatCurrency(payment.amountCents)}</strong>, em{' '}
        <strong>{formatDate(payment.paidAt)}</strong>, via{' '}
        <strong>
          {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
        </strong>
        , referente a <strong>{invoice.description}</strong>.
      </p>
      <Summary invoice={invoice} payment={payment} />
    </DocumentFrame>
  );
}
