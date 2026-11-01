import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordWebVitals } from '@/lib/server/web-vitals-ingest';
import { loggedLines } from '../../support/log-lines';

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/portal/web-vitals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('Feature: recebimento dos Web Vitals de campo (#559, #643, ADR-086)', () => {
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dadas duas medidas, Quando recebe, Então responde 202 com a contagem e registra uma linha por medida', async () => {
    const response = await recordWebVitals(
      request({
        route: '/portal',
        width: 390,
        metrics: [
          { name: 'LCP', value: 1834.4567, rating: 'good' },
          { name: 'CLS', value: 0.0123 },
        ],
      }),
      'patient',
    );

    expect(response.status).toBe(202);
    expect((await response.json()).data).toEqual({ received: 2 });
    const lines = loggedLines(info).filter((l) => l.msg === 'web-vital');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      level: 'info',
      metric: 'LCP',
      value: 1834.457,
      rating: 'good',
      route: '/portal',
      width: 400,
      role: 'patient',
    });
    expect(lines[1]).toMatchObject({
      metric: 'CLS',
      value: 0.012,
      rating: null,
      role: 'patient',
    });
  });

  it('Dada uma rota com id, query e largura exata, Quando recebe, Então o registro sai normalizado', async () => {
    await recordWebVitals(
      request({
        route: '/pacientes/42?nome=Maria',
        width: 391,
        metrics: [{ name: 'TTFB', value: 80 }],
      }),
      'guardian',
    );
    const [line] = loggedLines(info).filter((l) => l.msg === 'web-vital');
    expect(line).toMatchObject({
      route: '/pacientes/:id',
      width: 400,
      role: 'guardian',
      value: 80,
    });
  });

  it.each([
    ['JSON quebrado', '{nao-json'],
    ['corpo vazio', ''],
    ['sem medidas', { route: '/portal', width: 390, metrics: [] }],
    [
      'campo extra',
      {
        route: '/portal',
        width: 390,
        metrics: [{ name: 'LCP', value: 1 }],
        paciente: 'Maria',
      },
    ],
  ])(
    'Dado %s, Quando recebe, Então 400 "Medidas inválidas" e nada é registrado',
    async (_label, body) => {
      const response = await recordWebVitals(request(body), 'partner');
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('Medidas inválidas');
      expect(info).not.toHaveBeenCalled();
    },
  );
});
