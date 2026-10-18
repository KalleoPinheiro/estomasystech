import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/staff-revocation', () => ({
  isSessionRevoked: vi.fn().mockResolvedValue(false),
}));

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function loadProxy() {
  vi.resetModules();
  return (await import('@/proxy')).proxy;
}

const request = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, {
    headers: { 'x-forwarded-for': '10.0.0.9', ...headers },
  });

describe('Feature: request-id e liveness no proxy (#212, OBS-01, OBS-04)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('Dado requisição sem id, Quando passa no proxy, Então gera UUID e o repassa ao handler e à resposta', async () => {
    const proxy = await loadProxy();

    const response = await proxy(request('/api/auth/providers'));

    const id = response.headers.get('x-request-id');
    expect(id).toMatch(UUID);
    expect(response.headers.get('x-middleware-request-x-request-id')).toBe(id);
  });

  it('Dado id válido do proxy reverso, Quando passa, Então mantém o mesmo', async () => {
    const proxy = await loadProxy();

    const response = await proxy(
      request('/api/auth/providers', { 'x-request-id': 'caddy-abc12345' }),
    );

    expect(response.headers.get('x-request-id')).toBe('caddy-abc12345');
  });

  it('Dado id malformado, Quando passa, Então troca por um UUID', async () => {
    const proxy = await loadProxy();

    const response = await proxy(
      request('/api/auth/providers', { 'x-request-id': 'a b' }),
    );

    expect(response.headers.get('x-request-id')).toMatch(UUID);
  });

  it('Dado resposta negada (401), Quando passa, Então também leva o id', async () => {
    const proxy = await loadProxy();

    const response = await proxy(request('/api/patients'));

    expect(response.status).toBe(401);
    expect(response.headers.get('x-request-id')).toMatch(UUID);
  });

  it('Dado a liveness, Quando o limite da API já estourou, Então passa direto sem contar no banco', async () => {
    vi.stubEnv('API_RATE_LIMIT_MAX', '1');
    const proxy = await loadProxy();
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const { rateLimitWindows } = await import(
      '@/infrastructure/persistence/drizzle/schema'
    );
    await (await getDb()).delete(rateLimitWindows);

    for (let i = 0; i < 3; i += 1) {
      const response = await proxy(request('/api/health'));
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('x-middleware-request-x-request-id')).toBe(
        response.headers.get('x-request-id'),
      );
    }
    expect(await (await getDb()).select().from(rateLimitWindows)).toEqual([]);
  });
});
