import type { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

// Banco indisponível controlado pelo teste (#245): a falha nasce em
// `getRepositories` ou na leitura `clinics.findById`.
const db = vi.hoisted(() => ({
  failAt: null as 'getRepositories' | 'findById' | null,
  calls: 0,
}));

vi.mock('@/infrastructure/container', () => ({
  getRepositories: async () => {
    db.calls++;
    if (db.failAt === 'getRepositories') {
      throw new Error('banco indisponível');
    }
    return {
      clinics: {
        findById: async () => {
          throw new Error('banco indisponível');
        },
      },
    };
  },
}));

const SUPER_ADMIN = cookieHeaderFor('super_admin', 'dono@vitta.app', null);
const CLINIC_ID = 'clinica-alvo';

type Handler = (
  request: NextRequest,
  context: { params: Promise<{ id: string; accountId: string }> },
) => Promise<Response>;

interface PlatformRoute {
  name: string;
  method: string;
  url: string;
  body?: unknown;
  load: () => Promise<Handler>;
}

const base = `/api/platform/clinics/${CLINIC_ID}`;

const ROUTES: PlatformRoute[] = [
  {
    name: 'GET detalhe',
    method: 'GET',
    url: base,
    load: async () =>
      (await import('@/app/api/platform/clinics/[id]/route')).GET,
  },
  {
    name: 'PATCH cadastro',
    method: 'PATCH',
    url: base,
    body: { name: 'Nova' },
    load: async () =>
      (await import('@/app/api/platform/clinics/[id]/route')).PATCH,
  },
  {
    name: 'GET admins',
    method: 'GET',
    url: `${base}/admins`,
    load: async () =>
      (await import('@/app/api/platform/clinics/[id]/admins/route')).GET,
  },
  {
    name: 'POST admins (convite)',
    method: 'POST',
    url: `${base}/admins`,
    body: { email: 'admin@x.com' },
    load: async () =>
      (await import('@/app/api/platform/clinics/[id]/admins/route')).POST,
  },
  {
    name: 'PATCH admin (ação)',
    method: 'PATCH',
    url: `${base}/admins/conta-1`,
    body: { action: 'deactivate' },
    load: async () =>
      (await import('@/app/api/platform/clinics/[id]/admins/[accountId]/route'))
        .PATCH,
  },
  {
    name: 'POST suspender',
    method: 'POST',
    url: `${base}/suspend`,
    load: async () =>
      (await import('@/app/api/platform/clinics/[id]/suspend/route')).POST,
  },
  {
    name: 'POST reativar',
    method: 'POST',
    url: `${base}/reactivate`,
    load: async () =>
      (await import('@/app/api/platform/clinics/[id]/reactivate/route')).POST,
  },
];

const call = async (route: PlatformRoute, headers: Record<string, string>) => {
  const handler = await route.load();
  const response = await handler(
    jsonRequest(route.url, route.method, route.body, headers),
    { params: Promise.resolve({ id: CLINIC_ID, accountId: 'conta-1' }) },
  );
  return { response, json: (await response.json()) as unknown };
};

describe('Feature: Rotas da plataforma respondem no envelope com o banco fora (#245)', () => {
  afterEach(() => {
    db.failAt = null;
    db.calls = 0;
    vi.restoreAllMocks();
  });

  it.each(
    ROUTES.flatMap((route) =>
      (['getRepositories', 'findById'] as const).map(
        (failAt) => [route.name, failAt, route] as const,
      ),
    ),
  )(
    'Dado %s com falha em %s, Então 500 no envelope padrão',
    async (_name, failAt, route) => {
      db.failAt = failAt;
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { response, json } = await call(route, SUPER_ADMIN);

      expect(response.status).toBe(500);
      expect(json).toEqual({
        success: false,
        data: null,
        error: 'Erro interno do servidor',
      });
      expect(logged).toHaveBeenCalled();
    },
  );

  it.each(ROUTES.map((route) => [route.name, route] as const))(
    'Dado %s sem sessão, Então 401 sem tocar o repositório',
    async (_name, route) => {
      db.failAt = 'getRepositories';

      const { response } = await call(route, { cookie: '' });

      expect(response.status).toBe(401);
      expect(db.calls).toBe(0);
    },
  );
});
