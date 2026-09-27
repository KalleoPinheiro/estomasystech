import { afterEach, describe, expect, it, vi } from 'vitest';
import { appTimeZone, DEFAULT_APP_TIMEZONE } from '@/domain/shared/time-zone';
import {
  alignProcessTimeZone,
  assertProcessTimeZone,
  processTimeZone,
} from '@/lib/app-timezone';

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

  it('aligns process timezone: processo em UTC com APP_TIMEZONE=America/Sao_Paulo passa a rodar em São Paulo (#206, Vercel)', () => {
    vi.stubEnv('TZ', 'UTC');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(processTimeZone()).toBe('UTC');

    expect(() => alignProcessTimeZone()).not.toThrow();

    expect(processTimeZone()).toBe('America/Sao_Paulo');
    // 2027-01-11T12:00Z = 09:00 em São Paulo (UTC−3): o Date local acompanha.
    expect(new Date('2027-01-11T12:00:00Z').getHours()).toBe(9);
  });

  it('instrumentation.register alinha o fuso divergente e só encerra o processo se APP_TIMEZONE for inválido (só no runtime Node)', async () => {
    const { register } = await import('@/instrumentation');
    vi.stubEnv('TZ', 'UTC');
    vi.stubEnv('NODE_ENV', 'production');
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.stubEnv('APP_TIMEZONE', 'Fuso/Inexistente');
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await register();
    expect(exit).not.toHaveBeenCalled();

    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    await register();
    expect(exit).toHaveBeenCalledWith(1);
    expect(JSON.stringify(log.mock.calls)).toContain('APP_TIMEZONE');

    exit.mockClear();
    vi.stubEnv('TZ', 'UTC');
    vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    await register();
    expect(exit).not.toHaveBeenCalled();
    expect(processTimeZone()).toBe('America/Sao_Paulo');
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
