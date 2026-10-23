'use client';

import { useLayoutEffect, useRef } from 'react';

/** Variável CSS com a altura da faixa de homologação (0 fora dela). */
export const STAGING_BANNER_HEIGHT_VAR = '--staging-banner-h';

/**
 * Mede a faixa de homologação e publica a altura em `--staging-banner-h`, para
 * o menu lateral descontá-la da altura da janela: sem isso Tema e Sair ficavam
 * abaixo da dobra em janela baixa (#482).
 */
export function StagingBannerOffset({
  children,
}: {
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const root = document.documentElement;
    if (!element) {
      return;
    }
    const publish = () =>
      root.style.setProperty(
        STAGING_BANNER_HEIGHT_VAR,
        `${element.getBoundingClientRect().height}px`,
      );
    publish();
    // Navegador sem ResizeObserver: fica a medida inicial.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(publish);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(STAGING_BANNER_HEIGHT_VAR);
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
