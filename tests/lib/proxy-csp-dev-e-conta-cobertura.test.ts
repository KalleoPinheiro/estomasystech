import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const guardMock = vi.hoisted(() => ({
  result: null as unknown,
}));

vi.mock('@/lib/auth/require-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/require-session')>()),
  requireStaffSession: () => guardMock.result,
}));

import { requireOwnAccount } from '@/lib/auth/own-account';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Feature: CSP do proxy em desenvolvimento (issue #76)', () => {
  const cspFor = async (env: 'development' | 'production') => {
    vi.stubEnv('NODE_ENV', env);
    vi.stubEnv('AUTH_SECRET', 'vitest-auth-secret-0000000000000000');
    vi.resetModules();
    const { proxy } = await import('@/proxy');
    const response = await proxy(new NextRequest('http://localhost/login'));
    return response.headers.get('Content-Security-Policy') ?? '';
  };

  it('Dado servidor de desenvolvimento, Quando servir uma página, Então a CSP libera eval e estilo inline para o HMR', async () => {
    const csp = await cspFor('development');

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'/);
    expect(csp).toMatch(/style-src-elem 'self' 'unsafe-inline'/);
  });

  it('Dado produção, Quando servir uma página, Então a CSP exige nonce e proíbe eval', async () => {
    const csp = await cspFor('production');

    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toMatch(/style-src 'self' 'nonce-/);
  });
});

describe('Feature: Guarda de "Minha conta" (#295)', () => {
  it('Dado guarda que liberou sem sessão de conta real, Quando abrir Minha conta, Então 403', async () => {
    guardMock.result = { ok: true, session: null };

    const guard = await requireOwnAccount(
      new NextRequest('http://localhost/api/me'),
    );

    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.response.status).toBe(403);
  });
});
