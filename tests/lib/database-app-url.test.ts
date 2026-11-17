import { describe, expect, it } from 'vitest';
import { appDatabaseEnvName } from '@/lib/database-url';

describe('Feature: variável da conexão de runtime com fallback (ADR-110)', () => {
  it('Dado DATABASE_APP_URL definida, Quando resolvo a variável, Então vale DATABASE_APP_URL', () => {
    expect(
      appDatabaseEnvName({
        DATABASE_APP_URL: 'postgres://app@h/db',
        DATABASE_URL: 'postgres://dono@h/db',
      }),
    ).toBe('DATABASE_APP_URL');
  });

  it('Dado DATABASE_APP_URL ausente, Quando resolvo a variável, Então vale DATABASE_URL', () => {
    expect(appDatabaseEnvName({ DATABASE_URL: 'postgres://dono@h/db' })).toBe(
      'DATABASE_URL',
    );
  });

  it.each(['', '   ', '\n'])(
    'Dado DATABASE_APP_URL vazia (%j), Quando resolvo a variável, Então cai em DATABASE_URL',
    (blank) => {
      expect(
        appDatabaseEnvName({
          DATABASE_APP_URL: blank,
          DATABASE_URL: 'postgres://dono@h/db',
        }),
      ).toBe('DATABASE_URL');
    },
  );

  it('Dado só DATABASE_APP_URL, Quando resolvo a variável, Então vale DATABASE_APP_URL', () => {
    expect(
      appDatabaseEnvName({ DATABASE_APP_URL: 'postgres://app@h/db' }),
    ).toBe('DATABASE_APP_URL');
  });
});
