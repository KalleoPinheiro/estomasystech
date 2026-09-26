import { afterEach, describe, expect, it, vi } from 'vitest';
import { appTimeZone, DEFAULT_APP_TIMEZONE } from '@/domain/shared/time-zone';
import { assertProcessTimeZone, processTimeZone } from '@/lib/app-timezone';

/** Issue #205: processo e aplicação precisam concordar no fuso. */
describe('Feature: checagem de fuso na inicialização (#205)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('C27 produção com fuso divergente falha na inicialização', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');

    expect(processTimeZone()).toBe('UTC');
    expect(() => assertProcessTimeZone()).toThrow(
      /Fuso do processo \(UTC\) difere de APP_TIMEZONE \(America\/Sao_Paulo\)/,
    );
  });

  it('C27 fora de produção fuso divergente só loga', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => assertProcessTimeZone()).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('TZ=America/Sao_Paulo'),
    );
  });

  it('fusos iguais passam em silêncio, inclusive em produção', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_TIMEZONE', 'UTC');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => assertProcessTimeZone()).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('APP_TIMEZONE vazio usa o padrão America/Sao_Paulo', () => {
    vi.stubEnv('APP_TIMEZONE', '  ');

    expect(appTimeZone()).toBe(DEFAULT_APP_TIMEZONE);
  });

  it('instrumentation.register encerra o processo em produção com fuso divergente (só no runtime Node)', async () => {
    const { register } = await import('@/instrumentation');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await register();
    expect(exit).not.toHaveBeenCalled();

    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    await register();
    expect(exit).toHaveBeenCalledWith(1);
    expect(JSON.stringify(log.mock.calls)).toContain('APP_TIMEZONE');
  });

  it('instrumentation.register com fuso correto segue a subida', async () => {
    const { register } = await import('@/instrumentation');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_TIMEZONE', 'UTC');
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    await register();

    expect(exit).not.toHaveBeenCalled();
  });
});
