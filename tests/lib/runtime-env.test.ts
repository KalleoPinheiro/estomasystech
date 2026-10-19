import { describe, expect, it } from 'vitest';
import {
  assertNotProductionDatabase,
  isHomologationEnv,
  mockIntegrationsEnabled,
  resolveAppEnv,
} from '@/lib/runtime-env';

describe('Feature: Ambiente de execução (APP_ENV, ADR-041)', () => {
  describe('Cenário: resolveAppEnv', () => {
    it.each(['production', 'staging', 'preview', 'development'])(
      'Dado APP_ENV=%s, Então devolve o valor declarado',
      (value) => {
        expect(resolveAppEnv({ APP_ENV: value })).toBe(value);
      },
    );

    it('Dado APP_ENV desconhecido, Então lança', () => {
      expect(() => resolveAppEnv({ APP_ENV: 'qa' })).toThrow(
        'APP_ENV inválido: "qa"',
      );
    });

    it('Dado a Vercel sem APP_ENV, Então recusa em vez de adivinhar produção', () => {
      expect(() => resolveAppEnv({ VERCEL: '1' })).toThrow(
        'APP_ENV obrigatório na Vercel',
      );
    });

    it('Dado fora da Vercel sem APP_ENV, Então NODE_ENV decide', () => {
      expect(resolveAppEnv({ NODE_ENV: 'production' })).toBe('production');
      expect(resolveAppEnv({ NODE_ENV: 'test' })).toBe('development');
      expect(resolveAppEnv({})).toBe('development');
    });
  });

  describe('Cenário: isHomologationEnv', () => {
    it('Dado staging e preview, Então é homologação; production e development, não', () => {
      expect(isHomologationEnv({ APP_ENV: 'staging' })).toBe(true);
      expect(isHomologationEnv({ APP_ENV: 'preview' })).toBe(true);
      expect(isHomologationEnv({ APP_ENV: 'production' })).toBe(false);
      expect(isHomologationEnv({ APP_ENV: 'development' })).toBe(false);
    });
  });

  describe('Cenário: mockIntegrationsEnabled', () => {
    it('Dado MOCK_INTEGRATIONS ausente, Então desligado', () => {
      expect(mockIntegrationsEnabled({ APP_ENV: 'staging' })).toBe(false);
    });

    it('Dado MOCK_INTEGRATIONS=true em staging, Então ligado', () => {
      expect(
        mockIntegrationsEnabled({
          APP_ENV: 'staging',
          MOCK_INTEGRATIONS: 'true',
        }),
      ).toBe(true);
    });

    it('Dado MOCK_INTEGRATIONS=true em production, Então lança', () => {
      expect(() =>
        mockIntegrationsEnabled({
          APP_ENV: 'production',
          MOCK_INTEGRATIONS: 'true',
        }),
      ).toThrow('MOCK_INTEGRATIONS não pode ficar ligado em produção');
    });
  });

  describe('Cenário: assertNotProductionDatabase', () => {
    const url = 'postgres://u:p@db.prod.example.com:5432/app';

    it('Dado host de produção fora de production, Então recusa', () => {
      expect(() =>
        assertNotProductionDatabase(url, {
          APP_ENV: 'staging',
          PRODUCTION_DB_HOSTS: 'x.example.com, DB.prod.example.com',
        }),
      ).toThrow('Banco de produção recusado fora de production.');
    });

    it('Dado host de homologação, Então aceita', () => {
      expect(() =>
        assertNotProductionDatabase('postgres://u:p@ep-hml.neon.tech/db', {
          APP_ENV: 'staging',
          PRODUCTION_DB_HOSTS: 'db.prod.example.com',
        }),
      ).not.toThrow();
    });

    it('Dado APP_ENV=production, Então não confere a lista', () => {
      expect(() =>
        assertNotProductionDatabase(url, {
          APP_ENV: 'production',
          PRODUCTION_DB_HOSTS: 'db.prod.example.com',
        }),
      ).not.toThrow();
    });

    it('Dado lista vazia, Então aceita', () => {
      expect(() =>
        assertNotProductionDatabase(url, { APP_ENV: 'staging' }),
      ).not.toThrow();
    });

    it('Dado DATABASE_URL malformada, Então lança erro claro', () => {
      expect(() =>
        assertNotProductionDatabase('não é url', {
          APP_ENV: 'staging',
          PRODUCTION_DB_HOSTS: 'a',
        }),
      ).toThrow('DATABASE_URL inválida.');
    });
  });
});
