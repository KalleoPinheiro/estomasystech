import { describe, expect, it } from 'vitest';
import { planBuild } from '../../scripts/vercel-build';

describe('Feature: Build da Vercel (ADR-041)', () => {
  it('Dado production, Então só builda e não toca o banco', () => {
    expect(
      planBuild({ APP_ENV: 'production', DATABASE_URL: 'postgres://x/y' }),
    ).toEqual([['npm', 'run', 'build']]);
  });

  it('Dado staging, Então migra, semeia e builda nessa ordem', () => {
    const steps = planBuild({
      APP_ENV: 'staging',
      DATABASE_URL: 'postgres://u:p@ep-hml.neon.tech/db',
    });
    expect(steps.map((step) => step.join(' '))).toEqual([
      'npx --no-install drizzle-kit migrate',
      'npx --no-install tsx scripts/seed/run.ts',
      'npm run build',
    ]);
  });

  it('Dado staging sem banco, Então lança', () => {
    expect(() => planBuild({ APP_ENV: 'staging' })).toThrow('DATABASE_URL');
  });

  it('Dado banco de produção em preview, Então lança antes de migrar', () => {
    expect(() =>
      planBuild({
        APP_ENV: 'preview',
        DATABASE_URL: 'postgres://u:p@prod.example.com/db',
        PRODUCTION_DB_HOSTS: 'prod.example.com',
      }),
    ).toThrow('Banco de produção recusado');
  });

  it('Dado a Vercel sem APP_ENV, Então lança', () => {
    expect(() => planBuild({ VERCEL: '1' })).toThrow('APP_ENV obrigatório');
  });

  it('Dado DATABASE_URL_UNPOOLED, Então ela é a conferida', () => {
    expect(() =>
      planBuild({
        APP_ENV: 'staging',
        DATABASE_URL: 'postgres://u:p@pooler.neon.tech/db',
        DATABASE_URL_UNPOOLED: 'postgres://u:p@prod.example.com/db',
        PRODUCTION_DB_HOSTS: 'prod.example.com',
      }),
    ).toThrow('Banco de produção recusado');
  });
});
