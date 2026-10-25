'use client';

import {
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { EmptyState, ErrorAlert } from '@/components/feedback';
import { LoadMoreButton } from '@/components/load-more-button';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import type { PaymentMethod } from '@/domain/billing/invoice';
import { unwrapAction } from '@/lib/action-result';
import { apiFetchPage } from '@/lib/client';
import type { InvoiceDto } from '@/lib/dto';
import {
  formatCurrency,
  formatDate,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/lib/format';
import { homonymPatientIds, listPatientName } from '@/lib/patient-name';
import { updateInvoice } from './billing-actions';
import {
  DiscountForm,
  type PayerValues,
  PaymentForm,
} from './invoice-adjust-forms';

/** Tamanho da página que «Carregar mais» pede (o mesmo da primeira página, do servidor). */
const PAGE_SIZE = 100;

interface InvoicesTableProps {
  invoices: InvoiceDto[];
  onPay: (invoice: InvoiceDto) => void;
  onDiscount: (invoice: InvoiceDto) => void;
  onCancel: (invoice: InvoiceDto) => void;
}

/** Valor líquido; com desconto, o valor original riscado; parcial, o saldo. */
function AmountCell({ invoice }: { invoice: InvoiceDto }) {
  // Um único filho: na tabela empilhada o texto solto cairia sob o rótulo.
  return (
    <span>
      {invoice.discountCents > 0 && (
        <span className="mr-1 text-ink-3 text-xs line-through sm:mr-0 sm:block">
          {formatCurrency(invoice.amountCents)}
        </span>
      )}
      {formatCurrency(invoice.netAmountCents)}
      {invoice.status === 'pending' && invoice.paidCents > 0 && (
        <span className="block whitespace-nowrap font-normal text-warning text-xs">
          falta {formatCurrency(invoice.balanceCents)}
        </span>
      )}
    </span>
  );
}

/** Recebimentos com link para o recibo de cada um. */
function PaymentsCell({ invoice }: { invoice: InvoiceDto }) {
  if (invoice.payments.length === 0) {
    // Registro sem recebimentos detalhados: mostra o que a fatura guarda.
    return invoice.paymentMethod ? (
      <>
        {PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod}
        {invoice.paidAt ? ` em ${formatDate(invoice.paidAt)}` : ''}
      </>
    ) : (
      <>—</>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {invoice.payments.map((payment) => (
        <li key={payment.id}>
          {formatCurrency(payment.amountCents)} via{' '}
          {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method} em{' '}
          {formatDate(payment.paidAt)}
          {payment.payer ? ` · pago por ${payment.payer.name}` : ''} ·{' '}
          {/* <a>, não <Link>: o recibo é um documento imprimível fora do shell da equipe (#546); navegação completa evita pré-carregar um por pagamento. */}
          <a
            href={`/documentos/recibo/${invoice.id}/${payment.id}`}
            className="font-medium text-accent-ink hover:underline"
          >
            Recibo
          </a>
        </li>
      ))}
    </ul>
  );
}

function InvoicesTable({
  invoices,
  onPay,
  onDiscount,
  onCancel,
}: InvoicesTableProps) {
  const homonyms = homonymPatientIds(invoices);
  return (
    <div className="overflow-x-auto">
      <Table stack className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="px-3 py-3">Emissão</TableHead>
            <TableHead className="px-3 py-3">Paciente</TableHead>
            <TableHead className="px-3 py-3">Descrição</TableHead>
            <TableHead className="px-3 py-3 text-right">Valor</TableHead>
            <TableHead className="px-3 py-3">Status</TableHead>
            <TableHead className="px-3 py-3">Pagamento</TableHead>
            <TableHead className="px-3 py-3 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell label="Emissão" className="px-3 py-3 text-ink-2">
                {formatDate(invoice.issuedAt)}
              </TableCell>
              <TableCell
                label="Paciente"
                className="px-3 py-3 font-medium sm:min-w-44"
              >
                {listPatientName(invoice, homonyms)}
              </TableCell>
              <TableCell
                label="Descrição"
                className="px-3 py-3 text-ink-2 sm:max-w-32 sm:truncate"
              >
                {invoice.description}
              </TableCell>
              <TableCell
                label="Valor"
                className="px-3 py-3 text-right font-medium tabular-nums"
              >
                <AmountCell invoice={invoice} />
              </TableCell>
              <TableCell label="Status" className="px-3 py-3">
                <StatusBadge
                  status={invoice.status}
                  label={
                    INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status
                  }
                />
              </TableCell>
              <TableCell
                label="Pagamento"
                className="px-3 py-3 text-ink-2 text-xs"
              >
                <PaymentsCell invoice={invoice} />
              </TableCell>
              <TableCell
                label="Ações"
                className="px-3 py-3 text-right sm:whitespace-nowrap"
              >
                {invoice.status === 'pending' ? (
                  <span className="inline-flex flex-wrap justify-end gap-x-2 sm:flex-nowrap">
                    <Button
                      type="button"
                      onClick={() => onPay(invoice)}
                      variant="link"
                      className="h-auto p-0 text-success"
                    >
                      Receber
                    </Button>
                    <Button
                      type="button"
                      onClick={() => onDiscount(invoice)}
                      variant="link"
                      className="h-auto p-0 text-accent-ink"
                    >
                      Desconto
                    </Button>
                    {invoice.paidCents === 0 && (
                      <ConfirmAction
                        trigger={
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-danger"
                          >
                            Cancelar
                          </Button>
                        }
                        title="Cancelar fatura?"
                        description="A fatura é cancelada permanentemente."
                        confirmLabel="Cancelar fatura"
                        variant="danger"
                        onConfirm={() => onCancel(invoice)}
                      />
                    )}
                  </span>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface LoadedPages {
  /** Primeira página que o servidor entregou; muda a cada `refresh()` da tela. */
  source: InvoiceDto[];
  more: InvoiceDto[];
  cursor: string | null;
}

/**
 * Lista de faturas: a primeira página vem do servidor (o HTML já traz as
 * linhas) e «Carregar mais» busca as seguintes por cursor na API (única
 * exceção do ADR-069: paginação digitada pelo usuário). Toda ação grava por
 * Server Action e o servidor devolve a primeira página de novo; as páginas
 * extras voltam a zero, para nunca mostrar fatura desatualizada.
 */
export function InvoicesList({
  initialInvoices,
  initialCursor,
  status,
}: {
  initialInvoices: InvoiceDto[];
  initialCursor: string | null;
  status: string;
}) {
  const { toast } = useToast();
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paying, setPaying] = useState<InvoiceDto | null>(null);
  const [discounting, setDiscounting] = useState<InvoiceDto | null>(null);
  const [pages, setPages] = useState<LoadedPages>({
    source: initialInvoices,
    more: [],
    cursor: initialCursor,
  });
  // O servidor entregou outra primeira página (ação concluída ou outro filtro):
  // recomeça dela, em vez de manter páginas extras de antes.
  if (pages.source !== initialInvoices) {
    setPages({ source: initialInvoices, more: [], cursor: initialCursor });
    setLoadError(null);
  }
  const invoices = [...initialInvoices, ...pages.more];
  const error = actionError ?? loadError;

  const loadMore = async () => {
    if (!pages.cursor) return;
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      cursor: pages.cursor,
    });
    if (status) query.set('status', status);
    try {
      const page = await apiFetchPage<InvoiceDto>(`/api/invoices?${query}`);
      setPages((current) => ({
        ...current,
        more: [...current.more, ...page.items],
        cursor: page.nextCursor,
      }));
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Erro ao carregar dados',
      );
    }
  };

  const handlePay = async (
    invoice: InvoiceDto,
    amountCents: number,
    method: string,
    payer: PayerValues | null,
  ) => {
    const payerFields = payer
      ? { payerName: payer.name, payerCpf: payer.cpf }
      : {};
    // Saldo inteiro = quitar (fluxo histórico); qualquer outro valor vai como
    // parcial e o servidor recusa o que passa do saldo (FIN-RN-02), nunca
    // vira quitação silenciosa (#466).
    const partial = amountCents !== invoice.balanceCents;
    try {
      await unwrapAction(
        updateInvoice({
          id: invoice.id,
          change: partial
            ? {
                action: 'pay_partial',
                amountCents,
                method: method as PaymentMethod,
                ...payerFields,
              }
            : {
                action: 'pay',
                method: method as PaymentMethod,
                ...payerFields,
              },
        }),
      );
      toast({
        description: partial
          ? 'Pagamento parcial registrado'
          : 'Pagamento registrado',
        variant: 'success',
      });
      setPaying(null);
      setActionError(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao registrar pagamento',
      );
    }
  };

  // Erro fica no formulário do desconto (o modal continua aberto).
  const handleDiscount = async (
    invoice: InvoiceDto,
    amountCents: number,
    reason: string,
  ) => {
    await unwrapAction(
      updateInvoice({
        id: invoice.id,
        change: { action: 'discount', amountCents, reason },
      }),
    );
    toast({ description: 'Desconto aplicado', variant: 'success' });
    setDiscounting(null);
  };

  const handleCancel = async (invoice: InvoiceDto) => {
    try {
      await unwrapAction(
        updateInvoice({ id: invoice.id, change: { action: 'cancel' } }),
      );
      toast({
        description: 'Fatura cancelada',
        variant: 'success',
      });
      setActionError(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao cancelar fatura',
      );
    }
  };

  return (
    <>
      {error && <ErrorAlert message={error} />}

      <Card>
        {invoices.length === 0 ? (
          <EmptyState message="Nenhuma fatura encontrada." />
        ) : (
          <InvoicesTable
            invoices={invoices}
            onPay={setPaying}
            onDiscount={setDiscounting}
            onCancel={(invoice) => void handleCancel(invoice)}
          />
        )}
      </Card>

      <LoadMoreButton
        visible={pages.cursor !== null}
        onClick={() => void loadMore()}
      />

      {paying && (
        <Modal title="Registrar pagamento" onClose={() => setPaying(null)}>
          <PaymentForm
            invoice={paying}
            onPay={(amountCents, method, payer) =>
              handlePay(paying, amountCents, method, payer)
            }
          />
        </Modal>
      )}

      {discounting && (
        <Modal title="Desconto na fatura" onClose={() => setDiscounting(null)}>
          <DiscountForm
            invoice={discounting}
            onSave={(amountCents, reason) =>
              handleDiscount(discounting, amountCents, reason)
            }
          />
        </Modal>
      )}
    </>
  );
}
