import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { createSessionToken } from '@/lib/auth/session';

vi.mock('@/lib/auth/staff-revocation', () => ({
  isSessionRevoked: vi.fn().mockResolvedValue(false),
}));

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookie = () =>
  `estomasystech_session=${createSessionToken(
    process.env.AUTH_SECRET as string,
    Date.now() + 3_600_000,
    'ana@clinica.test',
    'atendente',
    'legacy-clinic',
  )}`;

const call = async (path: string) => {
  const { proxy } = await import('@/proxy');
  return proxy(
    new NextRequest(`http://localhost${path}`, {
      headers: { cookie: cookie(), 'x-forwarded-for': '10.9.9.9' },
    }),
  );
};

describe('Feature: Entrega de logo e avatar tem a CSP do sandbox, não a da página (#427)', () => {
  it.each(['/api/clinic/logo', '/api/account/avatar/conta-1'])(
    'Dada a rota de imagem %s, Quando passar pelo proxy, Então a CSP é a isolada (sandbox, sem script)',
    async (path) => {
      const response = await call(path);

      expect(response.headers.get('content-security-policy')).toBe(
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
    },
  );

  it('Dada uma rota de API comum, Quando passar pelo proxy, Então segue a CSP estrita com nonce', async () => {
    const response = await call('/api/me');

    expect(response.headers.get('content-security-policy')).toContain('nonce-');
  });

  it('Dado o upload (/api/account/avatar sem id), Quando passar pelo proxy, Então não é rota de imagem', async () => {
    const { isIdentityImagePath } = await import('@/proxy');

    expect(isIdentityImagePath('/api/account/avatar')).toBe(false);
    expect(isIdentityImagePath('/api/account/avatar/a/b')).toBe(false);
    expect(isIdentityImagePath('/api/clinic/logo')).toBe(true);
  });
});
