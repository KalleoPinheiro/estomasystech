'use client';

import { useEffect } from 'react';
import { isSettingsSectionSlug } from './sections';

/**
 * Links antigos `/configuracoes#horarios` (e e-mails/favoritos) seguem
 * funcionando (#522): o servidor não recebe o fragmento, então o índice lê o
 * `hash` no navegador e leva à sub-rota. Fragmento desconhecido não faz nada.
 * O retorno do OAuth do Google (`/configuracoes?calendar=…`) vai para a seção
 * Google Agenda com os mesmos parâmetros, que é onde o toast dispara.
 */
export function LegacyAnchorRedirect() {
  useEffect(() => {
    const { hash, search } = window.location;
    const params = new URLSearchParams(search);
    if (params.has('calendar')) {
      window.location.replace(
        `/configuracoes/google-agenda?${params.toString()}`,
      );
      return;
    }
    const slug = hash.replace(/^#/, '');
    if (isSettingsSectionSlug(slug)) {
      window.location.replace(`/configuracoes/${slug}`);
    }
  }, []);
  return null;
}
