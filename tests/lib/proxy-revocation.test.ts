import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';
import { isSessionRevoked } from '@/lib/auth/staff-revocation';
import { proxy } from '@/proxy';

vi.mock('@/lib/auth/staff-revocation', () => ({
  isSessionRevoked: vi.fn().mockResolvedValue(false),
}));

const SECRET = 'test-secret';
const revokedMock = vi.mocked(isSessionRevoked);

function staffRequest(path: string): NextRequest {
  const token = createSessionToken(
    SECRET,
    Date.now() + 60_000,
    'ana@clinica.com',
  );
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}

describe('Feature: Proxy barra sessão staff revogada (SEC1-01)', () => {
  const savedEnv = {
    secret: process.env.AUTH_SECRET,
    password: process.env.AUTH_PASSWORD,
  };

  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    process.env.AUTH_PASSWORD = 'senha-master';
    revokedMock.mockClear();
  });

  afterEach(() => {
    // Variável originalmente ausente precisa voltar a ausente — atribuir
    // undefined viraria a string "undefined" e vazaria para outros arquivos.
    for (const [key, value] of [
      ['AUTH_SECRET', savedEnv.secret],
      ['AUTH_PASSWORD', savedEnv.password],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('Dado sessão revogada em rota de API, Quando requisitar, Então 401 com envelope padrão', async () => {
    revokedMock.mockResolvedValueOnce(true);

    const response = await proxy(staffRequest('/api/patients'));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      data: null,
      error: 'Não autenticado',
    });
  });

  it('Dado sessão revogada em página, Quando requisitar, Então redireciona para /login com session_expired e next (#207)', async () => {
    revokedMock.mockResolvedValueOnce(true);

    const response = await proxy(staffRequest('/pacientes'));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get('location')).toBe(
      'http://localhost/login?error=session_expired&next=%2Fpacientes',
    );
  });

  it('Dado sessão não revogada, Quando requisitar, Então a requisição segue', async () => {
    revokedMock.mockResolvedValueOnce(false);

    const response = await proxy(staffRequest('/api/patients'));

    expect(response.status).toBe(200);
    expect(revokedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'ana@clinica.com',
        role: 'company_admin',
      }),
    );
  });
});
