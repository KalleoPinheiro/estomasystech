/**
 * Link de salto para o conteúdo principal (WCAG 2.4.1): primeiro item da ordem
 * de tabulação, invisível até receber o foco, para quem navega pelo teclado não
 * atravessar os itens do menu em toda tela.
 */
export const MAIN_CONTENT_ID = 'conteudo-principal';

export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-bg-elev focus:px-4 focus:py-2 focus:font-medium focus:text-ink focus:text-sm"
    >
      Pular para o conteúdo
    </a>
  );
}
