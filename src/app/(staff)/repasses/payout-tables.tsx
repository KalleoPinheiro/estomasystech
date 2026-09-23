'use client';

import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { useState } from 'react';
import { EmptyState } from '@/components/feedback';
import { Modal } from '@/components/modal';
import type {
  CommissionPayoutDto,
  PayoutItemDto,
  PayoutStatementDto,
} from '@/lib/dto';
import {
  formatCommissionRule,
  formatCurrency,
  formatDate,
  monthLabelPtBr,
  PAYMENT_METHOD_LABELS,
} from '@/lib/format';

/** Sessões de um fechamento (ou da prévia): data, procedimento, base e repasse. */
export function PayoutItemsTable({ items }: { items: PayoutItemDto[] }) {
  if (items.length === 0) {
    return <EmptyState message="Nenhuma sessão." />;
  }
  return (
    <div className="overflow-x-auto">
      <Table className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="py-2">Sessão</TableHead>
            <TableHead className="py-2">Procedimento</TableHead>
            <TableHead className="py-2 text-right">Base</TableHead>
            <TableHead className="py-2 text-right">Repasse</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.appointmentId}:${item.kind}`}>
              <TableCell className="py-2">
                {formatDate(item.sessionDate)}
              </TableCell>
              <TableCell className="py-2">
                {item.procedure}
                {item.kind === 'reversal' && (
                  <span className="ml-2 text-danger text-xs">
                    estorno (fatura cancelada após o pagamento)
                  </span>
                )}
              </TableCell>
              <TableCell className="py-2 text-right text-ink-2">
                {item.kind === 'reversal'
                  ? '—'
                  : formatCurrency(item.baseCents)}
              </TableCell>
              <TableCell className="py-2 text-right font-medium">
                {formatCurrency(item.commissionCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Botão que abre as sessões numa janela — reusado no histórico e na prévia. */
export function ItemsButton({
  title,
  items,
  label = 'Ver sessões',
}: {
  title: string;
  items: PayoutItemDto[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <PayoutItemsTable items={items} />
        </Modal>
      )}
    </>
  );
}

/**
 * Só o repasse ativo mais recente de cada profissional pode ser cancelado —
 * a API impõe a mesma regra; aqui só se evita oferecer o botão à toa.
 */
export function latestActiveIds(history: CommissionPayoutDto[]): Set<string> {
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const payout of history) {
    if (payout.status !== 'active' || seen.has(payout.professionalId)) continue;
    seen.add(payout.professionalId);
    ids.add(payout.id);
  }
  return ids;
}

function PayoutStatusCell({ payout }: { payout: CommissionPayoutDto }) {
  if (payout.status === 'active') {
    return <span>Pago</span>;
  }
  return (
    <span className="text-danger">
      Cancelado
      {payout.cancelReason && (
        <span className="block text-ink-3 text-xs">{payout.cancelReason}</span>
      )}
    </span>
  );
}

/** Repasses já registrados (inclusive cancelados), mais recentes primeiro. */
export function PayoutHistoryTable({
  history,
  showProfessional,
  onCancel,
}: {
  history: CommissionPayoutDto[];
  showProfessional: boolean;
  /** Presente só para o Admin — habilita "Cancelar" no repasse mais recente. */
  onCancel?: (payout: CommissionPayoutDto) => void;
}) {
  if (history.length === 0) {
    return <EmptyState message="Nenhum repasse registrado ainda." />;
  }
  const cancellable = latestActiveIds(history);
  return (
    <div className="overflow-x-auto">
      <Table className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="py-2">Mês</TableHead>
            {showProfessional && (
              <TableHead className="py-2">Profissional</TableHead>
            )}
            <TableHead className="py-2 text-right">Valor</TableHead>
            <TableHead className="py-2">Pago em</TableHead>
            <TableHead className="py-2">Forma</TableHead>
            <TableHead className="py-2">Situação</TableHead>
            <TableHead className="py-2 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((payout) => (
            <TableRow key={payout.id}>
              <TableCell className="py-2">
                {monthLabelPtBr(payout.period)}
              </TableCell>
              {showProfessional && (
                <TableCell className="py-2">
                  {payout.professionalName}
                </TableCell>
              )}
              <TableCell className="py-2 text-right font-medium">
                {formatCurrency(payout.totalCents)}
              </TableCell>
              <TableCell className="py-2">
                {formatDate(payout.paidAt)}
              </TableCell>
              <TableCell className="py-2">
                {PAYMENT_METHOD_LABELS[payout.paymentMethod] ??
                  payout.paymentMethod}
              </TableCell>
              <TableCell className="py-2">
                <PayoutStatusCell payout={payout} />
              </TableCell>
              <TableCell className="py-2 text-right">
                <ItemsButton
                  title={`Repasse de ${monthLabelPtBr(payout.period)} — ${payout.professionalName}`}
                  items={payout.items}
                  label={`${payout.items.length} sessões`}
                />
                <a
                  href={`/documentos/repasse/${payout.id}`}
                  className="mx-2 font-medium text-accent-ink text-xs hover:underline"
                >
                  Comprovante
                </a>
                {onCancel && cancellable.has(payout.id) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onCancel(payout)}
                  >
                    Cancelar
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function statusLabel(row: PayoutStatementDto): string {
  if (row.closedPayout) {
    return `Pago em ${formatDate(row.closedPayout.paidAt)}`;
  }
  if (!row.rule) return 'Sem regra de repasse';
  return row.payableCents > 0 ? 'Aberto' : 'Nada a pagar';
}

/** Visão do Admin: um profissional por linha no fechamento do mês. */
export function ClinicStatementsTable({
  rows,
  canClose,
  onClose,
}: {
  rows: PayoutStatementDto[];
  /** Mês já terminou — o fechamento é permitido. */
  canClose: boolean;
  onClose: (row: PayoutStatementDto) => void;
}) {
  if (rows.length === 0) {
    return <EmptyState message="Nenhum profissional cadastrado." />;
  }
  return (
    <div className="overflow-x-auto">
      <Table className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="py-2">Profissional</TableHead>
            <TableHead className="py-2">Regra</TableHead>
            <TableHead className="py-2 text-right">A pagar</TableHead>
            <TableHead className="py-2 text-right">A liberar</TableHead>
            <TableHead className="py-2">Situação</TableHead>
            <TableHead className="py-2 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.professionalId}>
              <TableCell className="py-2 font-medium">
                {row.professionalName}
              </TableCell>
              <TableCell className="py-2 text-ink-2">
                {formatCommissionRule(row.rule)}
              </TableCell>
              <TableCell className="py-2 text-right font-medium">
                {formatCurrency(
                  row.closedPayout?.totalCents ?? row.payableCents,
                )}
              </TableCell>
              <TableCell className="py-2 text-right text-ink-2">
                {formatCurrency(row.pendingCents)}
              </TableCell>
              <TableCell className="py-2">{statusLabel(row)}</TableCell>
              <TableCell className="py-2 text-right">
                <ItemsButton
                  title={`Sessões a pagar — ${row.professionalName}`}
                  items={row.closedPayout?.items ?? row.payable}
                />
                {!row.closedPayout && row.rule && row.payableCents > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="accent"
                    disabled={!canClose}
                    onClick={() => onClose(row)}
                  >
                    Registrar repasse
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
