'use client';

import { Card } from '@still-void/ui/react';
import { useState } from 'react';
import { MetricCard } from '@/components/metric-card';
import { Modal } from '@/components/modal';
import type {
  CommissionPayoutDto,
  PayoutStatementDto,
  PayoutsResponseDto,
} from '@/lib/dto';
import {
  formatCommissionRule,
  formatCurrency,
  formatDate,
  monthLabelPtBr,
} from '@/lib/format';
import { CancelPayoutForm } from './cancel-payout-form';
import { ClosePayoutForm } from './close-payout-form';
import {
  ClinicStatementsTable,
  ItemsButton,
  PayoutHistoryTable,
} from './payout-tables';

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

/**
 * Fechamento e histórico de repasses do mês. Os dados vêm do servidor (por
 * papel: o Admin vê a clínica, o Profissional o próprio extrato); aqui ficam só
 * os modais de fechar e cancelar, que gravam por Server Action e deixam a
 * própria ação atualizar a tela.
 */
export function PayoutsBoard({
  data,
  period,
  periodEnded,
}: {
  data: PayoutsResponseDto;
  period: string;
  /** Fechamento só depois que o mês termina (a API também recusa). */
  periodEnded: boolean;
}) {
  const [closing, setClosing] = useState<PayoutStatementDto | null>(null);
  const [cancelling, setCancelling] = useState<CommissionPayoutDto | null>(
    null,
  );

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" className="p-5">
        <h2 className="mb-3 font-semibold text-lg">
          Fechamento de {monthLabelPtBr(period)}
        </h2>
        {data.scope === 'own' && data.rows[0] ? (
          <OwnStatement row={data.rows[0]} period={period} />
        ) : (
          <>
            {!periodEnded && (
              <p className="mb-3 text-ink-2 text-sm">
                O fechamento fica disponível depois que o mês terminar.
              </p>
            )}
            <ClinicStatementsTable
              rows={data.rows}
              canClose={periodEnded}
              onClose={setClosing}
            />
          </>
        )}
        <p className="mt-3 text-ink-3 text-xs">
          O fechamento de um mês paga tudo o que foi liberado até o fim dele e
          ainda não foi pago — inclusive sessões de meses anteriores cujo
          pagamento do paciente chegou depois. Cada sessão é paga uma única vez;
          fatura cancelada após o repasse vira estorno no fechamento seguinte.
        </p>
      </Card>

      <Card as="section" className="p-5">
        <h2 className="mb-3 font-semibold text-lg">Repasses registrados</h2>
        <PayoutHistoryTable
          history={data.history}
          showProfessional={data.scope === 'clinic'}
          onCancel={data.scope === 'clinic' ? setCancelling : undefined}
        />
      </Card>

      {cancelling && (
        <Modal title="Cancelar repasse" onClose={() => setCancelling(null)}>
          <CancelPayoutForm
            payout={cancelling}
            onDone={() => setCancelling(null)}
          />
        </Modal>
      )}

      {closing && (
        <Modal title="Registrar repasse" onClose={() => setClosing(null)}>
          <ClosePayoutForm
            row={closing}
            period={period}
            onSaved={() => setClosing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
