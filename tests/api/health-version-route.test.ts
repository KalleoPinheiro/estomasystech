import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPublicPath } from '@/lib/auth/access-policy';

describe('Feature: versão pública somente leitura (ADR-095, #748)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('Dado a versão do build, Quando GET /api/health/version, Então 200 só com a versão e sem cache', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_VERSION', '0.7.0');
    vi.stubEnv('NEXT_PUBLIC_APP_COMMIT', 'abcdef1234567');
    vi.stubEnv('SOURCE_COMMIT', 'abcdef1234567');
    const { GET } = await import('@/app/api/health/version/route');

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      success: true,
      data: { version: '0.7.0' },
      error: null,
    });
  });

  it('Dado build sem versão, Quando GET /api/health/version, Então 404', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_VERSION', '');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');
    const { GET } = await import('@/app/api/health/version/route');

    expect((await GET()).status).toBe(404);
  });

  it('Dado a política de acesso, Quando consultar o caminho, Então dispensa sessão', () => {
    expect(isPublicPath('/api/health/version')).toBe(true);
  });
});
