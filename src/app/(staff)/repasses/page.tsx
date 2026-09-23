'use client';

import { Button, Card, Icon } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { MetricCard } from '@/components/metric-card';
import { Modal } from '@/components/modal';
import type {
  PayoutStatementDto,
  PayoutsResponseDto,
  SidebarIdentityDto,
} from '@/lib/dto';
import {
  formatCommissionRule,
  formatCurrency,
  formatDate,
  monthLabelPtBr,
  shiftMonth,
} from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import { ClosePayoutForm } from './close-payout-form';
import {
  ClinicStatementsTable,
  ItemsButton,
  PayoutHistoryTable,
} from './payout-tables';

const currentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/** Fechamento só depois que o mês termina (a API também recusa). */
const isEnded = (month: string): boolean => month < currentMonth();

/** Extrato do próprio Profissional: o que vai receber e o que já recebeu. */
function OwnStatement({
  row,
  period,
}: {
  row: PayoutStatementDto;
  period: string;
}) {
  const received = row.closedPayout;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <MetricCard
        label={
          received
            ? `Recebido pelo fechamento de ${monthLabelPtBr(period)}`
            : `A receber no fechamento de ${monthLabelPtBr(period)}`
        }
        value={formatCurrency(received?.totalCents ?? row.payableCents)}
        delta={
          received
            ? `Pago em ${formatDate(received.paidAt)}`
            : 'Sessões com pagamento do paciente já confirmado'
        }
      />
      <MetricCard
        label="Aguardando pagamento do paciente"
        value={formatCurrency(row.pendingCents)}
        accent="text-ink-2"
        delta="Libera quando a fatura é paga (ou após 60 dias de atraso)"
      />
      <Card className="p-5">
        <p className="text-ink-3 text-sm">Sua regra de repasse</p>
        <p className="mt-1 font-bold text-2xl">
          {formatCommissionRule(row.rule)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          <ItemsButton
            title="Sessões do fechamento"
            items={received?.items ?? row.payable}
          />
          <ItemsButton
            title="Sessões aguardando pagamento"
            items={row.pending}
            label="Ver pendentes"
          />
        </div>
      </Card>
    </div>
  );
}

export default function PayoutsPage() {
  const [month, setMonth] = useState(() => shiftMonth(currentMonth(), -1));
  const [closing, setClosing] = useState<PayoutStatementDto | null>(null);
  // Profissional lê o próprio extrato; Admin vê a clínica. A API decide o
  // acesso (famílias de rota) — aqui só se escolhe qual visão pedir.
  const { data: identity } =
    useApiQuery<SidebarIdentityDto>('/api/auth/identity');
  const endpoint =
    identity?.account?.role === 'profissional'
      ? '/api/my-payouts'
      : '/api/commission-payouts';
  const { data, error, isLoading, refresh } = useApiQuery<PayoutsResponseDto>(
    identity ? `${endpoint}?month=${month}` : null,
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="sv-display font-bold text-2xl">
          {data?.scope === 'own' ? 'Meus repasses' : 'Repasses'}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Mês anterior"
            variant="outline"
          >
            <Icon name="chevron-left" />
          </Button>
          <span className="min-w-40 text-center font-semibold text-lg">
            {monthLabelPtBr(month)}
          </span>
          <Button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="Próximo mês"
            variant="outline"
          >
            <Icon name="chevron-right" />
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}
      {!error && !data && isLoading && <LoadingIndicator />}

      {data && (
        <div className="flex flex-col gap-6">
          <Card as="section" className="p-5">
            <h2 className="mb-3 font-semibold text-lg">
              Fechamento de {monthLabelPtBr(month)}
            </h2>
            {data.scope === 'own' && data.rows[0] ? (
              <OwnStatement row={data.rows[0]} period={month} />
            ) : (
              <>
                {!isEnded(month) && (
                  <p className="mb-3 text-ink-2 text-sm">
                    O fechamento fica disponível depois que o mês terminar.
                  </p>
                )}
                <ClinicStatementsTable
                  rows={data.rows}
                  canClose={isEnded(month)}
                  onClose={setClosing}
                />
              </>
            )}
            <p className="mt-3 text-ink-3 text-xs">
              O fechamento de um mês paga tudo o que foi liberado até o fim dele
              e ainda não foi pago — inclusive sessões de meses anteriores cujo
              pagamento do paciente chegou depois. Cada sessão é paga uma única
              vez; fatura cancelada após o repasse vira estorno no fechamento
              seguinte.
            </p>
          </Card>

          <Card as="section" className="p-5">
            <h2 className="mb-3 font-semibold text-lg">Repasses registrados</h2>
            <PayoutHistoryTable
              history={data.history}
              showProfessional={data.scope === 'clinic'}
            />
          </Card>
        </div>
      )}

      {closing && (
        <Modal title="Registrar repasse" onClose={() => setClosing(null)}>
          <ClosePayoutForm
            row={closing}
            period={month}
            onSaved={() => {
              setClosing(null);
              refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
