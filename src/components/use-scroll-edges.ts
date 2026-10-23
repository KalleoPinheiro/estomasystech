'use client';

import { useEffect, useState } from 'react';

export interface ScrollEdges {
  /** Há conteúdo escondido à esquerda do que está à vista. */
  start: boolean;
  /** Há conteúdo escondido à direita do que está à vista. */
  end: boolean;
}

/** Folga em px: a rolagem fracionária deixa 1px de sobra no fim sem haver mais o que ver. */
const EDGE_SLACK = 2;

/**
 * Diz de que lado a rolagem horizontal de um elemento ainda tem conteúdo
 * escondido, para a tela indicar que dá para rolar (#525). Reavalia na rolagem
 * e quando a tela é redimensionada (rotação). Recebe o elemento (não um `ref`)
 * para reavaliar quando ele só aparece depois, como a lista de abas que espera a
 * ficha carregar.
 */
export function useScrollEdges(element: HTMLElement | null): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });

  useEffect(() => {
    if (!element) {
      return;
    }
    const update = () => {
      const start = element.scrollLeft > EDGE_SLACK;
      const end =
        element.scrollLeft + element.clientWidth <
        element.scrollWidth - EDGE_SLACK;
      setEdges((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end },
      );
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      element.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [element]);

  return edges;
}

/** Esmaece só a borda que esconde conteúdo; `undefined` quando nada está escondido. */
export function scrollFadeMask(edges: ScrollEdges): string | undefined {
  if (!edges.start && !edges.end) {
    return undefined;
  }
  const left = edges.start ? 'transparent, #000 2rem' : '#000, #000';
  const right = edges.end
    ? '#000 calc(100% - 2rem), transparent'
    : '#000, #000';
  return `linear-gradient(to right, ${left}, ${right})`;
}
