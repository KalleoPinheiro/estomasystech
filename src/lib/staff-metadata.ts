import type { Metadata } from 'next';

/** Marca no fim do título de toda tela da equipe (igual ao da aba no cliente). */
export const STAFF_TITLE_SUFFIX = 'EstomaSysTech';

/**
 * Metadados de uma tela da equipe: "Agenda — EstomaSysTech" (WCAG 2.4.2).
 * Vem do servidor, no `layout.tsx` de cada segmento, para o título já sair no
 * HTML e não ser sobrescrito pelo título do layout raiz na navegação (#479).
 */
export function staffMetadata(label: string): Metadata {
  return { title: `${label} — ${STAFF_TITLE_SUFFIX}` };
}
