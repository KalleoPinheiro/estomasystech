import { Table, TableBody, TableCell, TableRow } from '@still-void/ui/react';
import Link from 'next/link';
import { ClinicInfoIncompleteAlert } from '@/components/clinic-info-incomplete-alert';
import { DocumentFrame } from '@/components/document-frame';
import { ErrorAlert } from '@/components/feedback';
import { CNPJ_UNDER_REVIEW_MESSAGE } from '@/domain/billing/receipt';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import type { InvoiceDto, InvoicePaymentDto } from '@/lib/dto';
import {
  formatCurrency,
  formatDate,
  PAYMENT_METHOD_LABELS,
} from '@/lib/format';
import { getClinicInfoFor } from '@/lib/server/data/clinic-info';
import {
  getInvoiceDocumentData,
  getReceiptPartiesFor,
} from '@/lib/server/data/documents';
import { loadBlock } from '@/lib/server/data/load-block';
import { findDocumentIssuance } from '@/lib/server/document-issuance';
import { requireStaffPage } from '@/lib/server/session';

/**
 * Sem CPF do pagador ou CNPJ do prestador o erro vem com a orientação (#326):
 * o recibo não é emitido, e a página bloqueada não monta a emissão.
 */
function ReceiptBlocked({ message }: { message: string }) {
  return (
    <>
      <ErrorAlert message={message} />
      {message === CNPJ_UNDER_REVIEW_MESSAGE && (
        <Link
          href="/configuracoes"
          className="text-accent-ink text-sm hover:underline"
        >
          Corrigir o CNPJ nas Configurações
        </Link>
      )}
    </>
  );
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
 * Recibo de um pagamento (total ou parcial) de fatura no servidor (#546,
 * ADR-082): o que foi recebido, quando e como, e quanto ainda falta. Os valores
 * saem das mesmas funções da fatura (`invoices.ts`, #547). Emissão persistida
 * (`REC-…`) pela ilha de cliente, que reaplica a guarda de CPF/CNPJ (FIN-RN-15).
 */
export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ invoiceId: string; paymentId: string }>;
}) {
  const { invoiceId, paymentId } = await params;
  const session = await requireStaffPage({
    next: `/documentos/recibo/${invoiceId}/${paymentId}`,
  });
  const [clinic, invoice, parties] = await Promise.all([
    loadBlock(() => getClinicInfoFor(session)),
    loadBlock(() => getInvoiceDocumentData(session, invoiceId)),
    // O CPF inteiro só vem desta leitura, que também bloqueia a emissão sem os
    // documentos exigidos.
    loadBlock(() => getReceiptPartiesFor(session, invoiceId, paymentId)),
  ]);
  if (clinic.error !== null) return <ReceiptBlocked message={clinic.error} />;
  if (invoice.error !== null) return <ReceiptBlocked message={invoice.error} />;
  if (parties.error !== null) {
    return <ReceiptBlocked message={parties.error} />;
  }
  const payment = invoice.data.payments.find((p) => p.id === paymentId);
  if (!payment) {
    return <ErrorAlert message="Pagamento não encontrado nesta fatura." />;
  }
  if (!isClinicInfoComplete(clinic.data)) {
    return <ClinicInfoIncompleteAlert clinic={clinic.data} />;
  }
  const issuance = await findDocumentIssuance(session, 'recibo', paymentId);

  const settles =
    receivedUpTo(invoice.data, payment) >= invoice.data.netAmountCents;
  const { provider, payer, payerIsPatient } = parties.data;
  return (
    <DocumentFrame
      clinic={clinic.data}
      title="Recibo"
      issue={{ documentType: 'recibo', resourceId: paymentId, invoiceId }}
      documentNumber={issuance?.documentNumber}
      issuedAt={issuance?.issuedAt}
      footerNote={
        settles
          ? 'Este pagamento quita a fatura.'
          : 'Pagamento parcial: a fatura continua em aberto pelo saldo restante.'
      }
    >
      <p className="mb-4">
        {provider.name} (CNPJ {provider.document}) recebeu de{' '}
        <strong>{payer.name}</strong> (CPF {payer.document}) a quantia de{' '}
        <strong>{formatCurrency(payment.amountCents)}</strong>, em{' '}
        <strong>{formatDate(payment.paidAt)}</strong>, via{' '}
        <strong>
          {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
        </strong>
        , referente a <strong>{invoice.data.description}</strong>
        {payerIsPatient ? '' : ` (paciente: ${invoice.data.patientName})`}.
      </p>
      <Summary invoice={invoice.data} payment={payment} />
    </DocumentFrame>
  );
}
