import type { MetadataRoute } from 'next';
import { THEME_COLOR_DARK } from '@/lib/theme';

/**
 * Manifesto para instalar na tela inicial (#430, ADR-057). Marca da
 * plataforma, igual para todas as clínicas: o manifesto é público e não sabe
 * a clínica de quem pede. Sem service worker, então não há modo offline.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EstomaSysTech',
    short_name: 'EstomaSysTech',
    description: 'Gestão de clínica de estomaterapia',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLOR_DARK,
    theme_color: THEME_COLOR_DARK,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
