import { describe, expect, it } from 'vitest';
import { buildStepEnv } from '../../scripts/vercel-build';

describe('Feature: ambiente dos passos do build da Vercel (ADR-110)', () => {
  it('Dado DATABASE_APP_URL e DATABASE_URL_UNPOOLED, Quando monto o ambiente, Então o build usa o dono e não vê o login restrito', () => {
    const env = buildStepEnv({
      DATABASE_URL: 'postgres://u:p@pooler.neon.tech/db',
      DATABASE_URL_UNPOOLED: 'postgres://dono:p@direta.neon.tech/db',
      DATABASE_APP_URL: 'postgres://app:p@pooler.neon.tech/db',
      OUTRA: 'x',
    });
    expect(env.DATABASE_URL).toBe('postgres://dono:p@direta.neon.tech/db');
    expect('DATABASE_APP_URL' in env).toBe(false);
    expect(env.OUTRA).toBe('x');
  });

  it('Dado só DATABASE_URL, Quando monto o ambiente, Então ela segue e sslmode require vira verify-full', () => {
    const env = buildStepEnv({
      DATABASE_URL: 'postgres://u:p@h.neon.tech/db?sslmode=require',
    });
    expect(env.DATABASE_URL).toBe(
      'postgres://u:p@h.neon.tech/db?sslmode=verify-full',
    );
  });

  it('Dado nenhuma URL, Quando monto o ambiente, Então não inventa DATABASE_URL', () => {
    expect('DATABASE_URL' in buildStepEnv({})).toBe(false);
  });
});
