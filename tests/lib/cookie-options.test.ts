import { afterEach, describe, expect, it, vi } from 'vitest';
import { actingPatientCookieOptions } from '@/lib/auth/acting-patient';
import { expiredCookieOptions, sessionCookieOptions } from '@/lib/auth/session';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('atributos dos cookies atras do Traefik (#381)', () => {
  it('em producao o cookie de sessao e Secure, HttpOnly e SameSite=Lax', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(sessionCookieOptions()).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('o cookie do paciente representado segue o mesmo padrao', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(actingPatientCookieOptions()).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
  });

  it('o cookie que expira mantem os atributos e zera a validade', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(expiredCookieOptions()).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  });

  it('fora de producao nao exige HTTPS (localhost)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(sessionCookieOptions().secure).toBe(false);
  });
});
