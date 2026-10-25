import { Card } from '@still-void/ui/react';
import Link from 'next/link';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import type { Session } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/format';
import { buildMonthSummary } from '@/lib/server/data/month-summary';
import { loadBlock } from '@/lib/server/load-block';

export async function KpiGrid({ session }: { session: Session }) {
  const { data: summary, error } = await loadBlock(() =>
    buildMonthSummary(session),
  );
  if (error || !summary) {
    return <RefreshErrorAlert message={error ?? ''} />;
  }

  const cards = [
    {
      label: 'Recebido no mês',
      value: formatCurrency(summary.billing.paidCents),
      href: '/faturamento',
      tone: 'text-success',
    },
    {
      label: 'A receber',
      value: formatCurrency(summary.billing.pendingCents),
      href: '/faturamento',
      tone: 'text-warning',
    },
    {
      label: 'Consultas no mês',
      value: String(summary.appointmentsInMonth),
      href: '/agenda',
      tone: 'text-accent-ink',
    },
    {
      label: 'Faturas pendentes',
      value: String(summary.billing.pendingCount),
      href: '/faturamento',
      tone: 'text-warning',
    },
  ];

  return (
    <div
      data-kpi-grid
      className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
    >
      {cards.map((card) => (
        <Link key={card.label} href={card.href}>
          <Card className="h-full p-4 transition-colors hover:border-accent sm:p-5">
            <p className="text-ink-3 text-sm">{card.label}</p>
            <p
              className={`mt-1 font-bold text-xl tabular-nums sm:text-2xl ${card.tone}`}
            >
              {card.value}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
