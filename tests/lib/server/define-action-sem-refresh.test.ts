import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { CLINIC_A_ID, ensureTestClinics } from '../../support/clinics';
import { sessionToken } from '../../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE
        ? {
            name,
            value: sessionToken(
              'company_admin',
              'admin@clinica.com',
              undefined,
              CLINIC_A_ID,
            ),
          }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));

const build = async (refresh?: boolean) => {
  const { defineAction } = await import('@/lib/server/define-action');
  return defineAction({
    access: { kind: 'staff' },
    input: z.object({}),
    audit: false,
    refresh,
    handler: async () => 'ok',
  });
};

beforeEach(async () => {
  await ensureTestClinics();
  refreshed.mockClear();
});

describe('Feature: ação que não relê a tela (#546)', () => {
  it('Dada ação com refresh desligado, Quando concluir, Então a tela não é relida', async () => {
    const result = await (await build(false))({});

    expect(result.success).toBe(true);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dada ação sem a opção, Quando concluir, Então a tela é relida (padrão)', async () => {
    await (await build())({});

    expect(refreshed).toHaveBeenCalledTimes(1);
  });
});
