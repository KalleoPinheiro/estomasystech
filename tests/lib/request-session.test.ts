import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRequestSession } from '@/lib/auth/request-session';
import { createSessionToken } from '@/lib/auth/session';

const SECRET = 'test-secret';
let savedSecret: string | undefined;

function requestWithCookie(cookie?: string): NextRequest {
  return new NextRequest('http://localhost/x', {
    headers: cookie ? { cookie } : {},
  });
}

describe('Feature: Sessão da requisição (defesa em profundidade)', () => {
  beforeEach(() => {
    savedSecret = process.env.AUTH_SECRET;
  });

  afterEach(() => {
    if (savedSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = savedSecret;
    }
  });

  it('Dado AUTH_SECRET ausente, Quando getRequestSession, Então retorna null mesmo com cookie válido', () => {
    delete process.env.AUTH_SECRET;
    const token = createSessionToken(
      SECRET,
      Date.now() + 60_000,
      'maria@clinica.com',
    );
    const request = requestWithCookie(`estomasystech_session=${token}`);

    expect(getRequestSession(request)).toBeNull();
  });

  it('Dado AUTH_SECRET configurado e cookie de sessão válido, Quando getRequestSession, Então retorna a sessão', () => {
    process.env.AUTH_SECRET = SECRET;
    const token = createSessionToken(
      SECRET,
      Date.now() + 60_000,
      'maria@clinica.com',
      'company_admin',
    );
    const request = requestWithCookie(`estomasystech_session=${token}`);

    const session = getRequestSession(request);

    expect(session).not.toBeNull();
    expect(session?.subject).toBe('maria@clinica.com');
    expect(session?.role).toBe('company_admin');
  });

  it('Dado AUTH_SECRET configurado e cookie ausente, Quando getRequestSession, Então retorna null', () => {
    process.env.AUTH_SECRET = SECRET;
    const request = requestWithCookie();

    expect(getRequestSession(request)).toBeNull();
  });

  it('Dado AUTH_SECRET configurado e cookie inválido, Quando getRequestSession, Então retorna null', () => {
    process.env.AUTH_SECRET = SECRET;
    const request = requestWithCookie('estomasystech_session=token-invalido');

    expect(getRequestSession(request)).toBeNull();
  });

  it('Dado AUTH_SECRET configurado com token assinado por outro segredo, Quando getRequestSession, Então retorna null', () => {
    process.env.AUTH_SECRET = SECRET;
    const token = createSessionToken('outro-segredo', Date.now() + 60_000);
    const request = requestWithCookie(`estomasystech_session=${token}`);

    expect(getRequestSession(request)).toBeNull();
  });
});
