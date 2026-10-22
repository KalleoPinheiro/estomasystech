'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { type ReactNode, use } from 'react';
import { ClinicInfoIncompleteAlert } from '@/components/clinic-info-incomplete-alert';
import { type ClinicInfoDto, DocumentFrame } from '@/components/document-frame';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import type {
  CommissionPayoutDto,
  PayoutReceiptDto,
  SidebarIdentityDto,
} from '@/lib/dto';
import {
  formatCommissionRule,
  formatCurrency,
  formatDate,
  monthLabelPtBr,
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
  receipt: PayoutReceiptDto | null,
  error: string | null,
  issuance: DocumentIssuance | null,
): ReactNode | null {
  if (error) return <ErrorAlert message={error} />;
  if (!clinic || !receipt) return <LoadingIndicator />;
  if (!isClinicInfoComplete(clinic)) {
    return <ClinicInfoIncompleteAlert clinic={clinic} />;
  }
  // Sem emissão persistida, não renderiza: a data do rodapé nunca é `new Date()`.
  if (!issuance) return <LoadingIndicator />;
  return null;
}

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
 * Comprovante de repasse: o Admin emite qualquer um da clínica; o
 * Profissional, só o próprio (`/api/my-payouts/:id` devolve 404 para os demais).
 */
export default function PayoutReceiptPage({
  params,
}: {
  params: Promise<{ payoutId: string }>;
}) {
  const { payoutId } = use(params);
  const { data: identity, error: identityError } =
    useApiQuery<SidebarIdentityDto>('/api/auth/identity');
  const { data: clinic, error: clinicError } =
    useApiQuery<ClinicInfoDto>('/api/clinic-info');
  const endpoint =
    identity?.account?.role === 'profissional'
      ? `/api/my-payouts/${payoutId}`
      : `/api/commission-payouts/${payoutId}`;
  const { data: receipt, error: receiptError } = useApiQuery<PayoutReceiptDto>(
    identity ? endpoint : null,
  );
  // #468: documento bloqueado não é emitido, então não entra na trilha.
  const clinicReady = clinic !== null && isClinicInfoComplete(clinic);
  const { issuance, error: issuanceError } = useDocumentIssuance(
    'repasse',
    clinicReady ? payoutId : null,
  );

  const guard = guardBlock(
    clinic,
    receipt,
    identityError ?? clinicError ?? receiptError ?? issuanceError,
    issuance,
  );
  if (guard) return guard;
  if (!clinic || !receipt || !issuance) return null;

  const { payout, professional } = receipt;
  return (
    <DocumentFrame
      clinic={clinic}
      title="Comprovante de Repasse"
      documentNumber={issuance.documentNumber}
      issuedAt={issuance.issuedAt}
      patientSignature={{
        name: professional.fullName,
        roleLabel: 'Profissional — recebi o valor acima',
      }}
      footerNote="O repasse corresponde às sessões cujo pagamento do paciente foi confirmado; estornos descontam sessões pagas anteriormente cuja fatura foi cancelada."
    >
      <CancelledBanner payout={payout} />
      <p className="mb-4">
        {clinic.name} declara ter pago a{' '}
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
