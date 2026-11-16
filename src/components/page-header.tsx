interface PageHeaderProps {
  title: React.ReactNode;
  /** Linha de apoio abaixo do título (explicação da tela, contato do paciente). */
  description?: React.ReactNode;
  /** Selo ao lado do título (ex.: situação do paciente). */
  badge?: React.ReactNode;
  /** Acima do título (ex.: link de voltar). */
  leading?: React.ReactNode;
  /** Ações primárias da tela: abaixo do título no celular, à direita a partir de `sm`. */
  actions?: React.ReactNode;
}

/**
 * Cabeçalho único das telas da equipe: um `h1`, apoio opcional e ações.
 * Mobile first — empilha título e ações; a partir de `sm` lado a lado.
 */
export function PageHeader({
  title,
  description,
  badge,
  leading,
  actions,
}: PageHeaderProps) {
  return (
    <header
      data-page-header
      className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="min-w-0">
        {leading && <div className="mb-2">{leading}</div>}
        {/* Sem `flex-wrap` (#559): com o selo livre para trocar de linha, a troca de fonte (a
            largura do texto muda uns pixels) o jogava abaixo do título e de volta, e a tela
            inteira saltava 36 px (CLS 0,49 na ficha em 390 px). O título quebra dentro dele. */}
        <div className="flex items-center gap-x-3">
          <h1 className="sv-display min-w-0 break-words font-bold text-2xl">
            {title}
          </h1>
          {badge && <div>{badge}</div>}
        </div>
        {description && (
          <div className="mt-1 max-w-prose text-ink-3 text-sm">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div
          data-page-header-actions
          className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end"
        >
          {actions}
        </div>
      )}
    </header>
  );
}
