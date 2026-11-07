/**
 * Rotas da API carregadas por mapa estático (convenção de imports dinâmicos, AGENTS.md).
 *
 * `import(\`@/app/api${path}/route\`)` faz o Vite avisar (`vite:dynamic-import-vars`) e esconde
 * os avisos reais do log da suíte; cada rota vira uma entrada literal do mapa.
 */
import type { NextRequest } from 'next/server';

type Handler = (request: NextRequest) => Promise<Response>;
type ItemHandler = (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

const COLLECTION_ROUTES = {
  '/appointments': () => import('@/app/api/appointments/route'),
  '/documents/issue': () => import('@/app/api/documents/issue/route'),
  '/invoices': () => import('@/app/api/invoices/route'),
  '/packages': () => import('@/app/api/packages/route'),
  '/patients': () => import('@/app/api/patients/route'),
  '/procedures': () => import('@/app/api/procedures/route'),
  '/professionals': () => import('@/app/api/professionals/route'),
} as const;

const ITEM_ROUTES = {
  '/appointments': () => import('@/app/api/appointments/[id]/route'),
  '/invoices': () => import('@/app/api/invoices/[id]/route'),
} as const;

export type CollectionPath = keyof typeof COLLECTION_ROUTES;
export type ItemPath = keyof typeof ITEM_ROUTES;

/** Rota de coleção (`/api<path>/route`): expõe o `POST`. */
export const collectionRoute = async (
  path: CollectionPath,
): Promise<{ POST: Handler }> => COLLECTION_ROUTES[path]();

/** Rota de item (`/api<path>/[id]/route`): expõe o `PATCH`. */
export const itemRoute = async (
  path: ItemPath,
): Promise<{ PATCH: ItemHandler }> => ITEM_ROUTES[path]();
