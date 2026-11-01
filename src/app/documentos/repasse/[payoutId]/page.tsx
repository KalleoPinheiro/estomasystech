import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { ClinicInfoIncompleteAlert } from '@/components/clinic-info-incomplete-alert';
import { DocumentFrame } from '@/components/document-frame';
import { ErrorAlert } from '@/components/feedback';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import type { CommissionPayoutDto } from '@/lib/dto';
import {
  formatCommissionRule,
  formatCurrency,
  formatDate,
  monthLabelPtBr,
  PAYMENT_METHOD_LABELS,
} from '@/lib/format';
import { getClinicInfoFor } from '@/lib/server/data/clinic-info';
import { getPayoutReceiptFor } from '@/lib/server/data/documents';
import { loadBlock } from '@/lib/server/data/load-block';
import { findDocumentIssuance } from '@/lib/server/document-issuance';
import { requireStaffPage } from '@/lib/server/session';

function CancelledBanner({ payout }: { payout: CommissionPayoutDto }) {
  if (payout.status !== 'cancelled') return null;
  return (
    <div className="mb-6 border-2 border-black p-3 text-center">
      <p className="font-bold text-lg uppercase tracking-widest">Cancelado</p>
      <p className="text-xs">
        Repasse cancelado
        {payout.cancelledAt ? ` em ${formatDate(payout.cancelledAt)}` : ''}
        {payout.cancelReason ? ` — motivo: ${payout.cancelReason}` : ''}. Este
        comprovante não tem valor de quitação.
      </p>
    </div>
  );
}

function ReceiptItems({ payout }: { payout: CommissionPayoutDto }) {
  return (
    <Table className="mb-4 w-full border-collapse text-black text-xs">
      <TableHeader>
        <TableRow className="border-black border-b text-left">
          <TableHead className="py-1 pr-2 text-black">Sessão</TableHead>
          <TableHead className="py-1 pr-2 text-black">Procedimento</TableHead>
          <TableHead className="py-1 pr-2 text-right text-black">
            Base
          </TableHead>
          <TableHead className="py-1 text-right text-black">Repasse</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payout.items.map((item) => (
          <TableRow
            key={`${item.appointmentId}:${item.kind}`}
            className="border-black/30 border-b"
          >
            <TableCell className="py-1 pr-2">
              {formatDate(item.sessionDate)}
            </TableCell>
            <TableCell className="py-1 pr-2">
              {item.procedure}
              {item.kind === 'reversal' && (
                <em> — estorno (fatura cancelada após o pagamento)</em>
              )}
            </TableCell>
            <TableCell className="py-1 pr-2 text-right">
              {item.kind === 'reversal' ? '—' : formatCurrency(item.baseCents)}
            </TableCell>
            <TableCell className="py-1 text-right">
              {formatCurrency(item.commissionCents)}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="border-black border-t-2 font-bold">
          <TableCell className="py-1" colSpan={3}>
            Total
          </TableCell>
          <TableCell className="py-1 text-right">
            {formatCurrency(payout.totalCents)}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

/**
 * Comprovante de repasse no servidor (#546, ADR-082): o Admin emite qualquer um
 * da clínica; o Profissional, só o próprio (repasse de outro = 404). Os valores
 * saem das mesmas funções do repasse (#547).
 */
export default async function PayoutReceiptPage({
  params,
}: {
  params: Promise<{ payoutId: string }>;
}) {
  const { payoutId } = await params;
  const session = await requireStaffPage({
    next: `/documentos/repasse/${payoutId}`,
  });
  const [clinic, receipt] = await Promise.all([
    loadBlock(() => getClinicInfoFor(session)),
    loadBlock(() => getPayoutReceiptFor(session, payoutId)),
  ]);
  if (receipt.error !== null) return <ErrorAlert message={receipt.error} />;
  if (clinic.error !== null) return <ErrorAlert message={clinic.error} />;
  if (!isClinicInfoComplete(clinic.data)) {
    return <ClinicInfoIncompleteAlert clinic={clinic.data} />;
  }
  const issuance = await findDocumentIssuance(session, 'repasse', payoutId);

  const { payout, professional } = receipt.data;
  return (
    <DocumentFrame
      clinic={clinic.data}
      title="Comprovante de Repasse"
      issue={{ documentType: 'repasse', resourceId: payoutId }}
      documentNumber={issuance?.documentNumber}
      issuedAt={issuance?.issuedAt}
      patientSignature={{
        name: professional.fullName,
        roleLabel: 'Profissional — recebi o valor acima',
      }}
      footerNote="O repasse corresponde às sessões cujo pagamento do paciente foi confirmado; estornos descontam sessões pagas anteriormente cuja fatura foi cancelada."
    >
      <CancelledBanner payout={payout} />
      <p className="mb-4">
        {clinic.data.name} declara ter pago a{' '}
        <strong>{professional.fullName}</strong>
        {professional.registry ? ` (${professional.registry})` : ''} o valor de{' '}
        <strong>{formatCurrency(payout.totalCents)}</strong>, referente ao
        fechamento de <strong>{monthLabelPtBr(payout.period)}</strong>, em{' '}
        <strong>{formatDate(payout.paidAt)}</strong>, via{' '}
        <strong>
          {PAYMENT_METHOD_LABELS[payout.paymentMethod] ?? payout.paymentMethod}
        </strong>
        .
      </p>
      <p className="mb-4">
        Regra de repasse aplicada:{' '}
        <strong>
          {payout.rule ? formatCommissionRule(payout.rule) : 'não registrada'}
        </strong>
        {payout.rule?.kind === 'percentage'
          ? ' (sessões de pacote valem o preço efetivo pago por sessão)'
          : ''}
        .
      </p>
      <ReceiptItems payout={payout} />
      {payout.notes && <p className="mb-4">Observações: {payout.notes}</p>}
    </DocumentFrame>
  );
}
