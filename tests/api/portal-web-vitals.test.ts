import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_ROLES } from '@/lib/auth/staff-roles';
import { loggedLines } from '../support/log-lines';
import { cookieHeaderFor } from '../support/session';

const post = async (body: unknown, headers: Record<string, string> = {}) => {
  const { POST } = await import('@/app/api/portal/web-vitals/route');
  return POST(
    new NextRequest('http://localhost/api/portal/web-vitals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
};

const PAYLOAD = {
  route: '/portal',
  width: 390,
  metrics: [
    { name: 'LCP', value: 1834.4567, rating: 'good' },
    { name: 'CLS', value: 0.012 },
  ],
};

const PORTAL_ROLES = ['patient', 'guardian', 'partner'] as const;

describe('Feature: POST /api/portal/web-vitals (#643, errata da ADR-086)', () => {
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
    const cookie = cookieHeaderFor('patient');
    vi.stubEnv('AUTH_SECRET', '');
    const response = await post(PAYLOAD, cookie);
    expect(response.status).toBe(503);
    expect(info).not.toHaveBeenCalled();
  });

  it.each(PORTAL_ROLES)(
    'Dado o papel de portal %s com sessão, Quando envia, Então 202',
    async (role) => {
      const response = await post(PAYLOAD, cookieHeaderFor(role));
      expect(response.status).toBe(202);
      expect((await response.json()).data).toEqual({ received: 2 });
    },
  );

  it.each(STAFF_ROLES)(
    'Dado o papel de equipe %s, Quando envia, Então 403 e nada é registrado (a equipe tem /api/me/web-vitals)',
    async (role) => {
      const response = await post(PAYLOAD, cookieHeaderFor(role));
      expect(response.status).toBe(403);
      expect(info).not.toHaveBeenCalled();
    },
  );

  it.each(PORTAL_ROLES)(
    'Dado o papel %s, Quando envia, Então cada medida vira uma linha web-vital só com o papel',
    async (role) => {
      await post(PAYLOAD, cookieHeaderFor(role));
      const lines = loggedLines(info).filter((l) => l.msg === 'web-vital');

      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({
        level: 'info',
        metric: 'LCP',
        value: 1834.457,
        rating: 'good',
        route: '/portal',
        width: 400,
        role,
      });
      expect(lines[1]).toMatchObject({
        metric: 'CLS',
        value: 0.012,
        rating: null,
        role,
      });
    },
  );

  it('Dados dois pacientes e um responsável, Quando cada um envia, Então o log não distingue nem guarda quem enviou', async () => {
    const acting = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const senders = [
      cookieHeaderFor('patient', 'maria@paciente.test', 'clinica-a'),
      cookieHeaderFor('patient', 'joao@paciente.test', 'clinica-b'),
      {
        cookie: `${cookieHeaderFor('guardian', 'pai@responsavel.test').cookie}; estomasystech_acting_patient=${acting}`,
      },
    ];
    for (const headers of senders) {
      expect((await post(PAYLOAD, headers)).status).toBe(202);
    }

    const lines = loggedLines(info).filter((l) => l.msg === 'web-vital');
    expect(lines).toHaveLength(6);
    expect(Object.keys(lines[0] ?? {}).sort()).toEqual(
      Object.keys(lines[2] ?? {})
        .filter((key) => key in (lines[0] ?? {}))
        .sort(),
    );
    const raw = JSON.stringify(lines);
    for (const identity of [
      'maria@paciente.test',
      'joao@paciente.test',
      'pai@responsavel.test',
      'clinica-a',
      'clinica-b',
      acting,
    ]) {
      expect(raw).not.toContain(identity);
    }
  });

  it('Dado um cliente que manda rota com id e largura exata, Quando envia, Então o servidor normaliza de novo', async () => {
    await post(
      {
        route: '/portal/pacientes/42?nome=Maria',
        width: 391,
        metrics: [{ name: 'TTFB', value: 80 }],
      },
      cookieHeaderFor('patient'),
    );
    const [line] = loggedLines(info).filter((l) => l.msg === 'web-vital');
    expect(line).toMatchObject({ route: '/portal/pacientes/:id', width: 400 });
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
      const response = await post(body, cookieHeaderFor('patient'));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('Medidas inválidas');
      expect(info).not.toHaveBeenCalled();
    },
  );
});
