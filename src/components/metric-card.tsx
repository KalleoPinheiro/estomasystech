import { Card } from '@still-void/ui/react';

interface MetricCardProps {
  label: string;
  value: string;
  accent?: string;
  /** Delta percentual vs. período anterior (REL-04) — ex.: "+12,5% vs mês anterior". */
  delta?: string;
}

export function MetricCard({
  label,
  value,
  accent = 'text-accent-ink',
  delta,
}: MetricCardProps) {
  return (
    <Card className="h-full p-4 sm:p-5">
      <p className="text-ink-3 text-sm">{label}</p>
      <p
        className={`mt-1 font-bold text-xl tabular-nums sm:text-2xl ${accent}`}
      >
        {value}
      </p>
      {delta && <p className="mt-1 text-ink-3 text-xs">{delta}</p>}
    </Card>
  );
}
