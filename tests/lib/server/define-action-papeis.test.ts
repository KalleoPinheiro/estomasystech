import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { CLINIC_A_ID, ensureTestClinics } from '../../support/clinics';
import { sessionToken } from '../../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookie = { role: 'company_admin' as Parameters<typeof sessionToken>[0] };

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE
        ? {
            name,
            value: sessionToken(
              cookie.role,
              `${cookie.role}@x.com`,
              undefined,
              CLINIC_A_ID,
            ),
          }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: vi.fn() }));

const build = async (
  access: import('@/lib/server/define-action').ActionAccess,
) => {
  const { defineAction } = await import('@/lib/server/define-action');
  return defineAction({
    access,
    input: z.object({}),
    audit: false,
    handler: async () => 'ok',
  });
};

beforeEach(async () => {
  await ensureTestClinics();
});

describe('Feature: família e papel que podem executar uma ação (ADR-075)', () => {
  it.each(['patient', 'guardian', 'partner'] as const)(
    'Dado %s, Quando a ação é do portal, Então executa; e a ação da equipe recusa',
    async (role) => {
      cookie.role = role;

      expect((await (await build({ kind: 'portal' }))({})).success).toBe(true);
      expect((await (await build({ kind: 'staff' }))({})).success).toBe(false);
    },
  );

  it('Dado papel da equipe fora da lista da ação, Quando executar, Então recusa com a mensagem de papel', async () => {
    cookie.role = 'atendente';

    const result = await (
      await build({ kind: 'staff', roles: ['company_admin'] })
    )({});

    expect(result.error).toBe('Seu papel não tem acesso a este recurso');
  });
});
