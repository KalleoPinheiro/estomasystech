'use client';

import {
  Button,
  Card,
  Input,
  NativeSelect,
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
import { ErrorAlert } from '@/components/feedback';
import { LoadMoreButton } from '@/components/load-more-button';
import { MetricCard } from '@/components/metric-card';
import { Modal } from '@/components/modal';
import { PageHeader } from '@/components/page-header';
import { PagedList } from '@/components/paged-list';
import { StatusBadge } from '@/components/status-badge';
import type { InvoiceSummary } from '@/domain/billing/invoice-repository';
import { apiFetch } from '@/lib/client';
import type { InvoiceDto, PatientDto, ProcedureDto } from '@/lib/dto';
import {
  formatCurrency,
  formatDate,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import { useCursorPagedQuery } from '@/lib/use-cursor-paged-query';
import { DiscountForm, PaymentForm } from './invoice-adjust-forms';
import { InvoiceForm, type InvoiceFormValues } from './invoice-form';

const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'paid', label: 'Pagas' },
  { value: 'cancelled', label: 'Canceladas' },
];

const PAGE_SIZE = 100;

interface InvoicesTableProps {
  invoices: InvoiceDto[];
  onPay: (invoice: InvoiceDto) => void;
  onDiscount: (invoice: InvoiceDto) => void;
  onCancel: (invoice: InvoiceDto) => void;
}

/** Valor líquido; com desconto, o valor original riscado; parcial, o saldo. */
function AmountCell({ invoice }: { invoice: InvoiceDto }) {
  return (
    <>
      {invoice.discountCents > 0 && (
        <span className="mr-1 text-ink-3 text-xs line-through">
          {formatCurrency(invoice.amountCents)}
        </span>
      )}
      {formatCurrency(invoice.netAmountCents)}
      {invoice.status === 'pending' && invoice.paidCents > 0 && (
        <span className="block font-normal text-warning text-xs">
          falta {formatCurrency(invoice.balanceCents)}
        </span>
      )}
    </>
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
          {formatDate(payment.paidAt)} ·{' '}
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
  return (
    <div className="overflow-x-auto">
      <Table className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="px-4 py-3">Emissão</TableHead>
            <TableHead className="px-4 py-3">Paciente</TableHead>
            <TableHead className="px-4 py-3">Descrição</TableHead>
            <TableHead className="px-4 py-3 text-right">Valor</TableHead>
            <TableHead className="px-4 py-3">Status</TableHead>
            <TableHead className="px-4 py-3">Pagamento</TableHead>
            <TableHead className="px-4 py-3 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="px-4 py-3 text-ink-2">
                {formatDate(invoice.issuedAt)}
              </TableCell>
              <TableCell className="px-4 py-3 font-medium">
                {invoice.patientName}
              </TableCell>
              <TableCell className="max-w-56 truncate px-4 py-3 text-ink-2">
                {invoice.description}
              </TableCell>
              <TableCell className="px-4 py-3 text-right font-medium tabular-nums">
                <AmountCell invoice={invoice} />
              </TableCell>
              <TableCell className="px-4 py-3">
                <StatusBadge
                  status={invoice.status}
                  label={
                    INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status
                  }
                />
              </TableCell>
              <TableCell className="px-4 py-3 text-ink-2 text-xs">
                <PaymentsCell invoice={invoice} />
              </TableCell>
              <TableCell className="px-4 py-3 text-right">
                {invoice.status === 'pending' ? (
                  <>
                    <Button
                      type="button"
                      onClick={() => onPay(invoice)}
                      variant="link"
                      className="mr-2 h-auto p-0 text-success"
                    >
                      Receber
                    </Button>
                    <Button
                      type="button"
                      onClick={() => onDiscount(invoice)}
                      variant="link"
                      className="mr-2 h-auto p-0 text-accent-ink"
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
                  </>
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

function BillingSummaryCards({ summary }: { summary: InvoiceSummary | null }) {
  const paidCents = summary ? summary.paidCents : 0;
  const pendingCents = summary ? summary.pendingCents : 0;

  return (
    <>
      <MetricCard
        label="Total recebido"
        value={formatCurrency(paidCents)}
        accent="text-success"
      />
      <MetricCard
        label="Total a receber"
        value={formatCurrency(pendingCents)}
        accent="text-warning"
      />
    </>
  );
}

export default function BillingPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sellingPackage, setSellingPackage] = useState(false);
  const [paying, setPaying] = useState<InvoiceDto | null>(null);
  const [discounting, setDiscounting] = useState<InvoiceDto | null>(null);

  const {
    items: invoices,
    hasMore,
    error: loadError,
    refresh,
    loadMore,
  } = useCursorPagedQuery<InvoiceDto>(
    `/api/invoices${statusFilter ? `?status=${statusFilter}` : ''}`,
    PAGE_SIZE,
  );

  const { data: patients } = useApiQuery<PatientDto[]>('/api/patients');
  const { data: summary, refresh: refreshSummary } =
    useApiQuery<InvoiceSummary>('/api/invoices/summary');
  const error = actionError ?? loadError;

  const handleCreate = async (values: InvoiceFormValues) => {
    // Sem try/catch aqui de propósito: InvoiceForm já envolve este onSubmit
    // no próprio catch (mostra ErrorAlert inline e mantém o modal aberto) —
    // interceptar o erro aqui engoliria essa mensagem antes dela chegar lá.
    await apiFetch<InvoiceDto>('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        patientId: values.patientId,
        description: values.description,
        amountCents: Math.round(Number(values.amount) * 100),
        dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : null,
      }),
    });
    toast({
      description: 'Fatura criada',
      variant: 'success',
    });
    setCreating(false);
    refresh();
    refreshSummary();
  };

  const handlePay = async (
    invoice: InvoiceDto,
    amountCents: number,
    method: string,
  ) => {
    // Saldo inteiro = quitar (fluxo histórico); menos que isso = parcial.
    const partial = amountCents < invoice.balanceCents;
    try {
      await apiFetch<InvoiceDto>(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify(
          partial
            ? { action: 'pay_partial', amountCents, method }
            : { action: 'pay', method },
        ),
      });
      toast({
        description: partial
          ? 'Pagamento parcial registrado'
          : 'Pagamento registrado',
        variant: 'success',
      });
      setPaying(null);
      setActionError(null);
      refresh();
      refreshSummary();
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
    await apiFetch<InvoiceDto>(`/api/invoices/${invoice.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'discount', amountCents, reason }),
    });
    toast({ description: 'Desconto aplicado', variant: 'success' });
    setDiscounting(null);
    refresh();
    refreshSummary();
  };

  const handleCancel = async (invoice: InvoiceDto) => {
    try {
      await apiFetch<InvoiceDto>(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      });
      toast({
        description: 'Fatura cancelada',
        variant: 'success',
      });
      setActionError(null);
      refresh();
      refreshSummary();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao cancelar fatura',
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Faturamento"
        actions={
          <>
            <Button
              type="button"
              onClick={() => setSellingPackage(true)}
              variant="outline"
              className="text-accent-ink hover:bg-accent-soft"
            >
              Vender pacote
            </Button>
            <Button
              type="button"
              onClick={() => setCreating(true)}
              variant="accent"
            >
              + Nova fatura
            </Button>
          </>
        }
      />

      {error && <ErrorAlert message={error} />}

      <div
        data-kpi-grid
        className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:max-w-xl"
      >
        <BillingSummaryCards summary={summary} />
      </div>

      <fieldset
        className="mb-4 flex gap-2 border-0 p-0"
        aria-label="Filtrar por situação"
      >
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            aria-pressed={statusFilter === filter.value}
            className={`rounded-full px-3 py-1.5 font-medium text-sm ${
              statusFilter === filter.value
                ? 'bg-accent-ink text-white'
                : 'border border-border-strong text-ink-2 hover:bg-surface-2'
            }`}
          >
            {filter.label}
          </Button>
        ))}
      </fieldset>

      <Card>
        <PagedList
          items={invoices}
          emptyMessage="Nenhuma fatura encontrada."
          render={(list) => (
            <InvoicesTable
              invoices={list}
              onPay={setPaying}
              onDiscount={setDiscounting}
              onCancel={(invoice) => void handleCancel(invoice)}
            />
          )}
        />
      </Card>

      <LoadMoreButton
        visible={Boolean(invoices) && hasMore}
        onClick={loadMore}
      />

      <PackageSaleModal
        open={sellingPackage}
        patients={(patients ?? []).filter((p) => p.active)}
        onClose={() => setSellingPackage(false)}
        onSaved={() => {
          setSellingPackage(false);
          refresh();
          refreshSummary();
        }}
      />

      {creating && (
        <Modal title="Nova fatura" onClose={() => setCreating(false)}>
          <InvoiceForm
            patients={(patients ?? []).filter((p) => p.active)}
            onSubmit={handleCreate}
          />
        </Modal>
      )}

      {paying && (
        <Modal title="Registrar pagamento" onClose={() => setPaying(null)}>
          <PaymentForm
            invoice={paying}
            onPay={(amountCents, method) =>
              handlePay(paying, amountCents, method)
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
    </div>
  );
}

function PackageSaleModal({
  open,
  patients,
  onClose,
  onSaved,
}: {
  open: boolean;
  patients: PatientDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <Modal title="Vender pacote de sessões" onClose={onClose}>
      <PackageForm patients={patients} onSaved={onSaved} />
    </Modal>
  );
}

/** Venda de pacote (O3.3): fatura única; sessões consomem saldo na conclusão. */
function PackageForm({
  patients,
  onSaved,
}: {
  patients: PatientDto[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data: procedures } = useApiQuery<ProcedureDto[]>('/api/procedures');
  const [patientId, setPatientId] = useState('');
  const [procedureId, setProcedureId] = useState('');
  const [sessions, setSessions] = useState('10');
  const [price, setPrice] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const activeProcedures = (procedures ?? []).filter((p) => p.active);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/packages', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          procedureId,
          totalSessions: Number(sessions),
          priceCents: Math.round(Number(price) * 100),
          // Validade opcional: fim do dia escolhido no fuso local da clínica —
          // forçar UTC encurtaria o último dia em fusos a oeste (UTC-3: 20:59).
          expiresAt: expiresAt
            ? new Date(`${expiresAt}T23:59:59`).toISOString()
            : null,
        }),
      });
      toast({
        description: 'Pacote vendido',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao vender pacote');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Paciente *
        <NativeSelect
          required
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          className="mt-1"
        >
          <option value="">Selecione…</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.fullName}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="font-medium text-sm">
        Procedimento *
        <NativeSelect
          required
          value={procedureId}
          onChange={(e) => setProcedureId(e.target.value)}
          className="mt-1"
        >
          <option value="">Selecione…</option>
          {activeProcedures.map((procedure) => (
            <option key={procedure.id} value={procedure.id}>
              {procedure.name}
            </option>
          ))}
        </NativeSelect>
        {activeProcedures.length === 0 && (
          <span className="mt-1 block font-normal text-warning text-xs">
            Cadastre procedimentos no catálogo para vender pacotes.
          </span>
        )}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="font-medium text-sm">
          Sessões *
          <Input
            required
            type="number"
            min="1"
            max="100"
            value={sessions}
            onChange={(e) => setSessions(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Preço total (R$) *
          <Input
            required
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1"
          />
        </label>
      </div>
      <label className="font-medium text-sm">
        Validade
        <Input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="mt-1"
        />
        <span className="mt-1 block font-normal text-ink-3 text-xs">
          Opcional — sem data, o pacote não expira.
        </span>
      </label>
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Vendendo…' : 'Vender pacote'}
      </Button>
    </form>
  );
}
