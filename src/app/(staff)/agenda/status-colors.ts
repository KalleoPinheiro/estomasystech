/** Cores do bloco da consulta por situação, iguais na grade do mês e na semana. */
export const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-info-soft text-info border-info',
  confirmed: 'bg-accent-soft text-accent-ink border-accent',
  completed: 'bg-success-soft text-success border-success',
  cancelled: 'bg-surface-2 text-ink-3 border-border line-through',
  no_show: 'bg-warning-soft text-warning border-warning',
};
