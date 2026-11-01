import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_ROLES } from '@/lib/auth/staff-roles';
import { loggedLines } from '../support/log-lines';
import { cookieHeaderFor } from '../support/session';

const post = async (body: unknown, headers: Record<string, string> = {}) => {
  const { POST } = await import('@/app/api/me/web-vitals/route');
  return POST(
    new NextRequest('http://localhost/api/me/web-vitals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
};

const PAYLOAD = {
  route: '/pacientes/3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  width: 390,
  metrics: [
    { name: 'LCP', value: 1834.4567, rating: 'good' },
    { name: 'CLS', value: 0.012 },
  ],
};

describe('Feature: POST /api/me/web-vitals (#559, ADR-060)', () => {
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('Dado nenhuma sessão, Quando envia, Então 401 e nada é registrado', async () => {
    const response = await post(PAYLOAD);
    expect(response.status).toBe(401);
    expect(info).not.toHaveBeenCalled();
  });

  it('Dado AUTH_SECRET ausente, Quando envia, Então 503 (falha fechada)', async () => {
    const cookie = cookieHeaderFor('atendente');
    vi.stubEnv('AUTH_SECRET', '');
    const response = await post(PAYLOAD, cookie);
    expect(response.status).toBe(503);
  });

  it.each(STAFF_ROLES)(
    'Dado o papel de equipe %s com sessão, Quando envia, Então 202',
    async (role) => {
      const response = await post(PAYLOAD, cookieHeaderFor(role));
      expect(response.status).toBe(202);
    },
  );

  it.each(['patient', 'guardian', 'partner'] as const)(
    'Dado o papel de portal %s, Quando envia, Então 403 e nada é registrado',
    async (role) => {
      const response = await post(PAYLOAD, cookieHeaderFor(role));
      expect(response.status).toBe(403);
      expect(info).not.toHaveBeenCalled();
    },
  );

  it('Dada uma visita, Quando envia, Então cada medida vira uma linha web-vital sem id nem identidade', async () => {
    const response = await post(
      PAYLOAD,
      cookieHeaderFor('profissional', 'ana@clinica.test'),
    );
    const lines = loggedLines(info).filter((line) => line.msg === 'web-vital');

    expect((await response.json()).data).toEqual({ received: 2 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      level: 'info',
      metric: 'LCP',
      value: 1834.457,
      rating: 'good',
      route: '/pacientes/:id',
      width: 400,
      role: 'profissional',
    });
    expect(lines[1]).toMatchObject({
      metric: 'CLS',
      value: 0.012,
      rating: null,
    });
    const raw = JSON.stringify(lines);
    expect(raw).not.toContain('3f2504e0');
    expect(raw).not.toContain('ana@clinica.test');
  });

  it('Dado um cliente que manda rota com id e largura exata, Quando envia, Então o servidor normaliza de novo', async () => {
    await post(
      {
        route: '/pacientes/42?nome=Maria',
        width: 391,
        metrics: [{ name: 'TTFB', value: 80 }],
      },
      cookieHeaderFor('company_admin'),
    );
    const [line] = loggedLines(info).filter((l) => l.msg === 'web-vital');
    expect(line).toMatchObject({ route: '/pacientes/:id', width: 400 });
  });

  it.each([
    ['JSON quebrado', '{nao-json'],
    ['corpo vazio', ''],
    [
      'métrica fora do catálogo',
      { ...PAYLOAD, metrics: [{ name: 'FID', value: 1 }] },
    ],
    ['campo extra com dado pessoal', { ...PAYLOAD, patient: 'Maria' }],
  ])(
    'Dado %s, Quando envia, Então 400 e nada é registrado',
    async (_label, body) => {
      const response = await post(body, cookieHeaderFor('atendente'));
      expect(response.status).toBe(400);
      expect(info).not.toHaveBeenCalled();
    },
  );
});
