import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@/domain/auth/user-role';
import { ACTING_PATIENT_COOKIE } from '@/lib/auth/acting-patient';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { sessionToken } from '../../support/session';

const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
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
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
}));
vi.mock('@/lib/auth/staff-revocation', () => ({
  isSessionRevoked: async () => false,
}));

const signedIn = (role: UserRole) => {
  cookieJar.set(SESSION_COOKIE, sessionToken(role, `${role}@x.com`));
};

beforeEach(() => {
  cookieJar.clear();
  vi.resetModules();
});

describe('Feature: sessão do paciente nas páginas do portal (#553)', () => {
  it('Dado o responsável com paciente escolhido, Quando abre o portal, Então a sessão leva o paciente do cookie', async () => {
    signedIn('guardian');
    cookieJar.set(ACTING_PATIENT_COOKIE, 'pat-9');
    const { requirePatientPortalPage } = await import('@/lib/server/session');

    await expect(requirePatientPortalPage()).resolves.toMatchObject({
      role: 'guardian',
      actingPatientId: 'pat-9',
    });
  });

  it('Dado o responsável que ainda não escolheu, Quando abre o portal, Então a sessão não traz paciente escolhido', async () => {
    signedIn('guardian');
    const { requirePatientPortalPage } = await import('@/lib/server/session');

    await expect(requirePatientPortalPage()).resolves.toMatchObject({
      actingPatientId: null,
    });
  });

  it('Dado o paciente, Quando um cookie de «agir em nome de» aparece, Então ele é ignorado (só o responsável representa)', async () => {
    signedIn('patient');
    cookieJar.set(ACTING_PATIENT_COOKIE, 'pat-9');
    const { requirePatientPortalPage } = await import('@/lib/server/session');

    await expect(requirePatientPortalPage()).resolves.toMatchObject({
      role: 'patient',
      actingPatientId: null,
    });
  });

  it('Dado o parceiro ou a equipe, Quando abre a tela do paciente, Então recebe 403', async () => {
    for (const role of ['partner', 'company_admin'] as const) {
      signedIn(role);
      vi.resetModules();
      const { requirePatientPortalPage } = await import('@/lib/server/session');
      await expect(requirePatientPortalPage()).rejects.toThrow('FORBIDDEN');
    }
  });

  it('Dado a página /portal, Quando não há sessão ou a equipe entra, Então a guarda aberta redireciona ou deixa a página decidir', async () => {
    const { requireSignedInPage } = await import('@/lib/server/session');
    await expect(requireSignedInPage({ next: '/portal' })).rejects.toThrow(
      'REDIRECT /login?next=%2Fportal',
    );

    signedIn('company_admin');
    vi.resetModules();
    const again = await import('@/lib/server/session');
    await expect(again.requireSignedInPage()).resolves.toMatchObject({
      role: 'company_admin',
    });
  });
});
