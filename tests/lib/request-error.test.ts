import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportRequestError } from '@/lib/observability/request-error';
import { countSignals, resetSignals } from '@/lib/observability/signals';

describe('Erro não tratado na requisição (#212, OBS-09)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetSignals();
  });

  it('Dado erro de route handler, Quando o Next reporta, Então loga com requestId e rota do arquivo e conta 5xx', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    reportRequestError(
      new Error('falhou para fulano@x.com'),
      {
        path: '/api/patients/abc?nome=Fulano',
        method: 'GET',
        headers: { 'x-request-id': 'req-12345678', cookie: 'vitta_session=s' },
      },
      { routePath: '/api/patients/[id]', routeType: 'route' },
    );

    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line).toMatchObject({
      level: 'error',
      msg: 'Erro não tratado na requisição',
      requestId: 'req-12345678',
      method: 'GET',
      route: '/api/patients/[id]',
      routeType: 'route',
      error: { name: 'Error', message: 'falhou para [e-mail]' },
    });
    const raw = String(log.mock.calls[0][0]);
    expect(raw).not.toContain('Fulano');
    expect(raw).not.toContain('vitta_session');
    expect(countSignals('server-error', 0)).toBe(1);
  });

  it('Dado cabeçalho de request-id inválido ou repetido, Quando reporta, Então a linha sai sem ele', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    reportRequestError(
      new Error('x'),
      { path: '/', method: 'GET', headers: { 'x-request-id': ['a', 'b'] } },
      { routePath: '/', routeType: 'render' },
    );
    reportRequestError(
      new Error('x'),
      { path: '/', method: 'GET', headers: { 'x-request-id': 'x y' } },
      { routePath: '/', routeType: 'render' },
    );

    for (const [line] of log.mock.calls) {
      expect(JSON.parse(String(line))).not.toHaveProperty('requestId');
    }
  });
});
