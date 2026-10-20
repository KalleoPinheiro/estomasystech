import { describe, expect, it } from 'vitest';
import { formatAppVersion } from '@/lib/app-version';
import nextConfig, { APP_VERSION } from '../../next.config';
import pkg from '../../package.json';

describe('Feature: Versão da aplicação visível às clínicas (ADR-043)', () => {
  it('Dado uma versão semver, Quando formata, Então prefixa com v', () => {
    expect(formatAppVersion('0.2.0')).toBe('v0.2.0');
  });

  it('Dado versão e SHA (homologação), Quando formata, Então mostra o SHA curto', () => {
    expect(
      formatAppVersion('0.2.0', 'f64b7af2064c80e82bf492233ad8bfec7f683ddb'),
    ).toBe('v0.2.0 (f64b7af)');
  });

  it('Dado SHA vazio (produção), Quando formata, Então mostra só a versão', () => {
    expect(formatAppVersion('1.0.0', '')).toBe('v1.0.0');
  });

  it.each([undefined, '', '  ', 'latest', '1.0', '<script>'])(
    'Dado a versão %j, Quando formata, Então não renderiza nada',
    (value) => {
      expect(formatAppVersion(value)).toBeNull();
    },
  );

  it('Dado SHA que não é hexadecimal, Quando formata, Então ignora o SHA', () => {
    expect(formatAppVersion('1.0.0', 'não-é-sha')).toBe('v1.0.0');
  });

  it('Dado o next.config, Então embute a versão do package.json no build', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(nextConfig.env?.NEXT_PUBLIC_APP_VERSION).toBe(pkg.version);
  });
});
