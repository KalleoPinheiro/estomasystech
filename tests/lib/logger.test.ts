import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/observability/logger';
import { runWithRequestId } from '@/lib/observability/request-context';

const lastLine = (spy: { mock: { calls: unknown[][] } }) =>
  JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;

describe('Logger estruturado (#212, OBS-05)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado log fora de requisição, Quando info, Então sai uma linha JSON sem requestId', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.info('subiu', { port: 3000 });

    expect(info).toHaveBeenCalledTimes(1);
    const line = lastLine(info);
    expect(line).toMatchObject({ level: 'info', msg: 'subiu', port: 3000 });
    expect(Date.parse(String(line.time))).not.toBeNaN();
    expect(line).not.toHaveProperty('requestId');
  });

  it('Dado contexto do proxy, Quando warn, Então a linha leva o requestId', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    runWithRequestId('req-12345678', () => logger.warn('atenção'));

    expect(lastLine(warn)).toMatchObject({
      level: 'warn',
      msg: 'atenção',
      requestId: 'req-12345678',
    });
  });

  it('Dado erro, Quando error, Então vai para o stderr em JSON', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('falhou', { alert: 'readiness' });

    expect(lastLine(error)).toMatchObject({
      level: 'error',
      msg: 'falhou',
      alert: 'readiness',
    });
  });

  it('Dado requisição do Next, Quando loga, Então lê o x-request-id repassado pelo proxy', async () => {
    vi.resetModules();
    vi.doMock('next/headers', () => ({
      headers: () =>
        Promise.resolve(new Headers({ 'x-request-id': 'hdr-12345678' })),
    }));
    const { logger: fresh } = await import('@/lib/observability/logger');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    fresh.info('no handler');
    await vi.waitFor(() => expect(info).toHaveBeenCalled());

    expect(lastLine(info)).toMatchObject({ requestId: 'hdr-12345678' });
    vi.doUnmock('next/headers');
  });

  it('Dado cabeçalho inválido ou leitura que falha, Quando loga, Então sai sem requestId', async () => {
    vi.resetModules();
    let call = 0;
    vi.doMock('next/headers', () => ({
      headers: () => {
        call += 1;
        return call === 1
          ? Promise.resolve(new Headers({ 'x-request-id': 'x y' }))
          : Promise.reject(new Error('fora de escopo'));
      },
    }));
    const { logger: fresh } = await import('@/lib/observability/logger');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    fresh.info('um');
    fresh.info('dois');
    await vi.waitFor(() => expect(info).toHaveBeenCalledTimes(2));

    for (const [line] of info.mock.calls) {
      expect(JSON.parse(String(line))).not.toHaveProperty('requestId');
    }
    vi.doUnmock('next/headers');
  });
});
