import { Icon } from '@still-void/ui/react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import { zonedMonthKey } from '@/domain/shared/time-zone';
import { PAYOUT_PERIOD_REGEX, previousPeriod } from '@/lib/dto';
import { monthLabelPtBr, shiftMonth } from '@/lib/format';
import { loadBlock } from '@/lib/server/data/load-block';
import {
  getClinicPayoutsFor,
  getOwnPayoutsFor,
} from '@/lib/server/data/payouts';
import { requireStaffPageFor } from '@/lib/server/session';
import { PayoutsBoard } from './payouts-board';

const NAV_LINK =
  'inline-flex size-11 items-center justify-center rounded-md border border-border-strong text-ink-2 hover:bg-surface-2';

/**
 * Repasses no servidor (#547, ADR-069): o extrato do mês chega no HTML, pelo
 * papel (o Admin vê a clínica; o Profissional só o próprio extrato) e sem
 * chamar `/api`. O mês é `?month=AAAA-MM` num `Link`; fechar e cancelar repasse
 * são Server Actions (`payout-actions.ts`) com auditoria na mesma transação.
 */
export default async function PayoutsPage(props?: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const session = await requireStaffPageFor('/repasses');
  const requested = (await props?.searchParams)?.month;
  const month =
    requested && PAYOUT_PERIOD_REGEX.test(requested)
      ? requested
      : previousPeriod(new Date());
  const own = session.role === 'profissional';
  const { data, error } = await loadBlock(() =>
    own
      ? getOwnPayoutsFor(session, month)
      : getClinicPayoutsFor(session, month),
  );

  return (
    <div>
      <PageHeader
        title={data?.scope === 'own' ? 'Meus repasses' : 'Repasses'}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href={`/repasses?month=${shiftMonth(month, -1)}`}
              aria-label="Mês anterior"
              className={NAV_LINK}
            >
              <Icon name="chevron-left" />
            </Link>
            <span className="min-w-40 text-center font-semibold text-lg">
              {monthLabelPtBr(month)}
            </span>
            <Link
              href={`/repasses?month=${shiftMonth(month, 1)}`}
              aria-label="Próximo mês"
              className={NAV_LINK}
            >
              <Icon name="chevron-right" />
            </Link>
          </div>
        }
      />

      {error && <RefreshErrorAlert message={error} />}

      {data && (
        <PayoutsBoard
          data={data}
          period={month}
          periodEnded={month < zonedMonthKey(new Date())}
        />
      )}
    </div>
  );
}
