import { CategoryPill } from '@still-void/ui/react';

/**
 * Cor por status usando os tokens semânticos do Still Void — fixos e
 * independentes do accent do site, justamente para "pago" nunca colidir com a
 * cor da marca. Sempre a variante -ink, que é a que bate 4.5:1 no tema claro.
 */
const COLOR_BY_STATUS: Record<string, string> = {
  scheduled: 'var(--sv-info-ink)',
  confirmed: 'var(--sv-accent-ink)',
  completed: 'var(--sv-success-ink)',
  cancelled: 'var(--sv-text-3)',
  no_show: 'var(--sv-warning-ink)',
  pending: 'var(--sv-warning-ink)',
  paid: 'var(--sv-success-ink)',
  /** Zero é mais grave que "baixo" — precisa de token de perigo, não o cinza
   * neutro de `cancelled` nem o âmbar de `pending` (achado [P0] Materiais). */
  out_of_stock: 'var(--sv-danger-ink)',
  /** Pedido do titular (#293): aceito × recusado pela clínica. */
  accepted: 'var(--sv-success-ink)',
  rejected: 'var(--sv-danger-ink)',
};

const FALLBACK_COLOR = 'var(--sv-text-3)';

interface StatusBadgeProps {
  status: string;
  label: string;
}

/**
 * Selo de status como pílula do design system: ponto colorido + label, nunca
 * emoji (regra de fidelidade do Still Void).
 *
 * Usa `CategoryPill` com cor por token, não `Badge` — decisão original da
 * migração v2, quando `Badge variant="destructive"` usava um degrau cru do
 * Tailwind hardcoded (lacuna `badge-hardcoded-red`, fechada na `3.1.0`: hoje
 * `sv-badge--destructive` resolve para `var(--sv-danger)`). `CategoryPill`
 * segue sendo a escolha certa aqui por dar controle direto de cor por status,
 * não por contornar mais nenhum defeito da lib.
 */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <CategoryPill
      label={label}
      color={COLOR_BY_STATUS[status] ?? FALLBACK_COLOR}
    />
  );
}
