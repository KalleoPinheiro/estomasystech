import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { sessionToken } from '../../support/session';

const countTriage = vi.fn();
const logged = vi.fn();
const cookieStore = { value: undefined as string | undefined };

vi.mock('@/lib/server/data/triage', () => ({
  countLinkedTriageQueue: (...args: unknown[]) => countTriage(...args),
}));
vi.mock('@/lib/server/data/identity', () => ({
  buildSidebarIdentity: async () => ({ clinicLabel: 'Clínica X' }),
}));
vi.mock('@/lib/server/data/version', () => ({
  getAppVersion: async () => ({ version: '0.4.0', releasedAt: null }),
}));
vi.mock('@/lib/log-error', () => ({
  logError: (...args: unknown[]) => logged(...args),
}));
vi.mock('@/lib/auth/staff-revocation', () => ({
  isSessionRevoked: async () => false,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  forbidden: () => {
    throw new Error('FORBIDDEN');
  },
}));

beforeEach(() => {
  vi.resetModules();
  countTriage.mockReset();
  logged.mockClear();
});

describe('Feature: contador da triagem no casco da equipe (#549)', () => {
  it('Dado o profissional, Quando o layout carrega o casco, Então o contador da barra do celular já vem pronto', async () => {
    cookieStore.value = sessionToken('profissional', 'pro@clinica.com');
    countTriage.mockResolvedValue(4);
    const { loadStaffShell } = await import('@/lib/server/data/staff-shell');

    const shell = await loadStaffShell();

    expect(shell.triageCount).toBe(4);
    expect(countTriage.mock.calls[0][0]).toMatchObject({
      role: 'profissional',
    });
  });

  it.each(['atendente', 'company_admin'] as const)(
    'Dado o papel %s (sem o atalho de Triagem na barra), Quando carrega o casco, Então não conta fotos',
    async (role) => {
      cookieStore.value = sessionToken(role, `${role}@clinica.com`);
      const { loadStaffShell } = await import('@/lib/server/data/staff-shell');

      const shell = await loadStaffShell();

      expect(shell.triageCount).toBeUndefined();
      expect(countTriage).not.toHaveBeenCalled();
    },
  );

  it('Dada falha ao contar a triagem, Quando o profissional carrega o casco, Então a tela não cai: o contador fica indefinido, o erro vai ao log e o resto segue', async () => {
    cookieStore.value = sessionToken('profissional', 'pro@clinica.com');
    countTriage.mockRejectedValue(new Error('banco fora'));
    const { loadStaffShell } = await import('@/lib/server/data/staff-shell');

    const shell = await loadStaffShell();

    expect(shell.triageCount).toBeUndefined();
    expect(shell.identity).toEqual({ clinicLabel: 'Clínica X' });
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
