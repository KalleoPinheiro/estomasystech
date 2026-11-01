import { PageHeader } from '@/components/page-header';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import { startOfZonedDayAfter } from '@/domain/shared/time-zone';
import { listAppointmentsFor } from '@/lib/server/data/appointments';
import { loadBlock } from '@/lib/server/data/load-block';
import {
  getSupplyInsightsFor,
  listSuppliesFor,
} from '@/lib/server/data/supplies';
import { requireStaffPageFor } from '@/lib/server/session';
import { ExpiryBanner } from './expiry-banner';
import { NewSupplyButton } from './new-supply-button';
import { SuppliesBoard } from './supplies-board';

/**
 * Materiais e estoque no servidor (#556, ADR-083): insumos, previsão de
 * ruptura, lotes a vencer e as consultas do dia (vínculo da baixa) chegam no
 * HTML, em paralelo, e a carga não chama `/api`. Cadastro, edição e
 * movimentação são Server Actions (`supply-actions.ts`) com auditoria na mesma
 * transação; o histórico de um insumo é lido sob demanda, ao abrir.
 */
export default async function SuppliesPage() {
  const session = await requireStaffPageFor('/materiais');
  const now = new Date();

  const [supplies, insights, appointments] = await Promise.all([
    loadBlock(() => listSuppliesFor(session)),
    loadBlock(() => getSupplyInsightsFor(session)),
    loadBlock(() =>
      listAppointmentsFor(session, {
        from: startOfZonedDayAfter(now, 0),
        to: startOfZonedDayAfter(now),
      }),
    ),
  ]);

  return (
    <div>
      <PageHeader title="Materiais e estoque" actions={<NewSupplyButton />} />

      {supplies.error && <RefreshErrorAlert message={supplies.error} />}
      <ExpiryBanner batches={insights.data?.expiringBatches ?? []} />

      <SuppliesBoard
        supplies={supplies.data ?? []}
        insights={insights.data?.bySupply ?? []}
        insightsError={insights.error}
        todayAppointments={appointments.data ?? []}
      />
    </div>
  );
}
