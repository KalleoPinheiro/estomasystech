import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawnSync }));

import { run } from '../../scripts/vercel-build';

describe('Feature: cada passo do build roda com o ambiente do dono (ADR-110)', () => {
  beforeEach(() => spawnSync.mockReset());

  it('Dado DATABASE_APP_URL no ambiente, Quando um passo roda, Então o filho recebe o dono e não o login restrito', () => {
    spawnSync.mockReturnValue({ status: 0 });
    run(['npx', 'tsx', 'scripts/seed/run.ts'], {
      DATABASE_URL: 'postgres://app:p@pooler.neon.tech/db',
      DATABASE_URL_UNPOOLED: 'postgres://dono:p@direta.neon.tech/db',
      DATABASE_APP_URL: 'postgres://app:p@pooler.neon.tech/db',
    });

    const [bin, args, options] = spawnSync.mock.calls[0];
    expect(bin).toBe('npx');
    expect(args).toEqual(['tsx', 'scripts/seed/run.ts']);
    expect(options.env.DATABASE_URL).toBe(
      'postgres://dono:p@direta.neon.tech/db',
    );
    expect('DATABASE_APP_URL' in options.env).toBe(false);
  });

  it('Dado um passo que falha, Quando roda, Então lança', () => {
    spawnSync.mockReturnValue({ status: 1 });
    expect(() => run(['npm', 'run', 'build'], {})).toThrow(
      'Passo falhou: npm run build',
    );
  });
});
