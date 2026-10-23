'use client';

import { useEffect } from 'react';

/**
 * Marca `<html data-hydrated>` quando o React assumiu a página. Entre o HTML
 * chegar e a hidratação (cold start, rede lenta) os botões já aparecem mas
 * ainda não respondem; o CSS usa a marca para mostrar o cursor de espera nesse
 * intervalo, em vez de um botão aparentemente quebrado (#484).
 */
export function HydrationMark() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);
  return null;
}
