'use client';

import { useEffect, useRef } from 'react';

const FADE = '1.5rem';

interface ScrollFadeProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Área que rola na vertical e esmaece a borda onde ainda há conteúdo escondido
 * (#524): sem isso a lista do menu em celular baixo corta itens sem nenhum
 * indício de rolagem. As bordas vêm de `--fade-top`/`--fade-bottom`, que a máscara
 * em `globals.css` (`.scroll-fade`) lê; o conteúdo no fim da rolagem fica sem
 * esmaecer.
 */
export function ScrollFade({ className = '', children }: ScrollFadeProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const update = () => {
      const max = element.scrollHeight - element.clientHeight;
      element.style.setProperty(
        '--fade-top',
        element.scrollTop > 1 ? FADE : '0px',
      );
      element.style.setProperty(
        '--fade-bottom',
        element.scrollTop < max - 1 ? FADE : '0px',
      );
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Sem ResizeObserver fica a medida inicial e a do scroll/resize.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    for (const child of Array.from(element.children)) {
      observer?.observe(child);
    }
    return () => {
      element.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className={`scroll-fade ${className}`}>
      {children}
    </div>
  );
}
