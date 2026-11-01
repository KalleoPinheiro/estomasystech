import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE, type Session } from '@/lib/auth/session';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';
import { sessionToken } from '../../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
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

const sessionOf = (clinicId: string | null): Session => ({
  expiresAtMs: Date.now() + 60_000,
  subject: 'ana@clinica.com',
  role: clinicId === null ? 'super_admin' : 'company_admin',
  clinicId,
  professionalId: null,
});

beforeEach(async () => {
  await ensureTestClinics();
  cookieStore.value = undefined;
});

describe('Feature: identidade da equipe lida no servidor (ADR-069)', () => {
  it('Dadas as sessões das clínicas A e B, Quando lê a identidade, Então cada uma vê só o nome da própria clínica', async () => {
    const { buildSidebarIdentity } = await import('@/lib/server/data/identity');

    const a = await buildSidebarIdentity(sessionOf(CLINIC_A_ID));
    const b = await buildSidebarIdentity(sessionOf(CLINIC_B_ID));

    expect(b.clinicLabel).toBe('Clínica B (teste)');
    expect(a.clinicLabel).not.toBe(b.clinicLabel);
    expect(a.account).toMatchObject({
      email: 'ana@clinica.com',
      role: 'company_admin',
    });
  });

  it('Dada a conta de sistema (sem empresa), Quando lê a identidade, Então devolve o rótulo de sistema sem consultar clínica', async () => {
    const { buildSidebarIdentity, SYSTEM_ACCOUNT_LABEL } = await import(
      '@/lib/server/data/identity'
    );

    const identity = await buildSidebarIdentity(sessionOf(null));

    expect(identity.clinicLabel).toBe(SYSTEM_ACCOUNT_LABEL);
  });

  it('Dada empresa sem linha no banco, Quando lê a identidade, Então avisa que a clínica não foi encontrada', async () => {
    const { buildSidebarIdentity } = await import('@/lib/server/data/identity');

    const identity = await buildSidebarIdentity(
      sessionOf('clinica-que-nao-existe'),
    );

    expect(identity.clinicLabel).toBe('Clínica não encontrada');
  });

  it('Dado o cookie do admin da clínica B, Quando a página pede a identidade da equipe, Então vem a da clínica B', async () => {
    cookieStore.value = sessionToken(
      'company_admin',
      'ana@clinica.com',
      undefined,
      CLINIC_B_ID,
    );
    const { getStaffIdentity } = await import('@/lib/server/data/identity');

    expect((await getStaffIdentity()).clinicLabel).toBe('Clínica B (teste)');
  });

  it('Dado que não há sessão, Quando a página pede a identidade da equipe, Então vai ao login em vez de ler dado', async () => {
    const { getStaffIdentity } = await import('@/lib/server/data/identity');

    await expect(getStaffIdentity()).rejects.toThrow('REDIRECT /login');
  });
});
