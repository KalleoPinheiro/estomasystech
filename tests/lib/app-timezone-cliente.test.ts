import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertClientTimeZone } from '@/lib/app-timezone';

describe('Feature: fuso do cliente fixado no build (ADR-073)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('Dado fuso do build diferente do runtime, Quando em produção, Então recusa subir; fora dela só avisa', () => {
    vi.stubEnv('APP_TIMEZONE', 'America/Manaus');
    vi.stubEnv('NEXT_PUBLIC_APP_TIMEZONE', 'America/Sao_Paulo');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertClientTimeZone()).toThrow(/difere do fixado no build/);

    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => assertClientTimeZone()).not.toThrow();
    expect(JSON.stringify(warn.mock.calls)).toContain('fixado no build');
  });

  it('Dado fuso do build igual ao do runtime ou ausente, Quando confere, Então segue', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    vi.stubEnv('NEXT_PUBLIC_APP_TIMEZONE', 'America/Sao_Paulo');
    expect(() => assertClientTimeZone()).not.toThrow();
    vi.stubEnv('NEXT_PUBLIC_APP_TIMEZONE', '');
    expect(() => assertClientTimeZone()).not.toThrow();
  });
});
