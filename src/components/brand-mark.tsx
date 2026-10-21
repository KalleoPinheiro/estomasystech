interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * Marca do EstomaSysTech: um "E" feito de três barras arredondadas sobre um
 * quadrado de cantos suaves, com um ponto à direita (o pulso do cuidado, e o
 * mesmo ponto da marca do Still Void). Segue o acento da clínica: o quadrado
 * usa `--sv-accent-ink` e o desenho `--sv-bg`, o mesmo par de cores do botão de
 * acento, que já cumpre o contraste AA em todos os modos e acentos.
 *
 * Decorativa por padrão (`aria-hidden`): o nome "EstomaSysTech" aparece em
 * texto ao lado dela.
 */
export function BrandMark({ size = 40, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="48" height="48" rx="12" fill="var(--sv-accent-ink)" />
      <g fill="var(--sv-bg)">
        <rect x="9" y="11" width="6" height="26" rx="3" />
        <rect x="9" y="11" width="22" height="6" rx="3" />
        <rect x="9" y="21" width="15" height="6" rx="3" />
        <rect x="9" y="31" width="22" height="6" rx="3" />
        <circle cx="36" cy="24" r="3.5" />
      </g>
    </svg>
  );
}
