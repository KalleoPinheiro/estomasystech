import { afterEach, describe, expect, it, vi } from 'vitest';
import { appUrlFromEnv } from '@/application/auth/send-invite';

/** #467: na Vercel, a URL de produção do projeto serve de base quando falta `APP_URL`. */
describe('Feature: URL pública do convite na Vercel (#467)', () => {
  afterEach(() => vi.unstubAllEnvs());

  const prod = (env: Record<string, string>) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  };

  it('Dada a Vercel com domínio de produção e sem APP_URL, Quando montar a base, Então usa https://<domínio>', () => {
    prod({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'app.exemplo.com' });
    expect(appUrlFromEnv()).toBe('https://app.exemplo.com');
  });

  it('Dada a Vercel com APP_URL configurada, Quando montar a base, Então APP_URL vence', () => {
    prod({
      VERCEL: '1',
      VERCEL_PROJECT_PRODUCTION_URL: 'app.exemplo.com',
      APP_URL: 'https://clinica.exemplo.com',
    });
    expect(appUrlFromEnv()).toBe('https://clinica.exemplo.com');
  });

  it('Dado o domínio da Vercel fora da Vercel, Quando montar a base em produção, Então recusa', () => {
    prod({ VERCEL_PROJECT_PRODUCTION_URL: 'app.exemplo.com' });
    expect(() => appUrlFromEnv()).toThrow(/APP_URL/);
  });

  it('Dada a Vercel sem domínio de produção, Quando montar a base em produção, Então recusa', () => {
    prod({ VERCEL: '1' });
    expect(() => appUrlFromEnv()).toThrow(/APP_URL/);
  });
});
