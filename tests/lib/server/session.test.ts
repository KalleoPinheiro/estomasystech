import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@/domain/auth/user-role';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { sessionToken } from '../../support/session';

const cookieStore = { value: undefined as string | undefined };
const cookiesRead = vi.fn();
const revoked = vi.fn(async () => false);

vi.mock('next/headers', () => ({
  cookies: async () => {
    cookiesRead();
    return {
      get: (name: string) =>
        name === SESSION_COOKIE && cookieStore.value !== undefined
          ? { name, value: cookieStore.value }
          : undefined,
    };
  },
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  forbidden: () => {
    throw new Error('FORBIDDEN');
  },
}));
// `React.cache` só deduplica dentro de uma renderização do servidor; aqui cada
// teste é "uma requisição": memoiza a chamada até o `vi.resetModules()` seguinte.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    let memo: { value: R } | undefined;
    return (...args: A): R => {
      memo ??= { value: fn(...args) };
      return memo.value;
    };
  },
}));
vi.mock('@/lib/auth/staff-revocation', () => ({
  isSessionRevoked: (...args: unknown[]) => revoked(...(args as [])),
}));

const loadGuards = async () => import('@/lib/server/session');

const signedIn = (role: UserRole) => {
  cookieStore.value = sessionToken(role, `${role}@clinica.com`);
};

beforeEach(() => {
  vi.resetModules();
  cookieStore.value = undefined;
  cookiesRead.mockClear();
  revoked.mockClear();
  revoked.mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Feature: sessão no servidor por cookies (ADR-069 § 1)', () => {
  it('Dado um papel de equipe com sessão válida, Quando a página pede a guarda, Então recebe a sessão', async () => {
    signedIn('atendente');
    const { requireStaffPage } = await loadGuards();

    const session = await requireStaffPage();

    expect(session.role).toBe('atendente');
    expect(session.subject).toBe('atendente@clinica.com');
  });

  it('Dado sessão válida, Quando layout, página e componente pedem a sessão na mesma requisição, Então o cookie e a revogação são lidos uma só vez', async () => {
    signedIn('company_admin');
    const { requireStaffPage, readSession } = await loadGuards();

    await requireStaffPage();
    await requireStaffPage({ roles: ['company_admin'] });
    await readSession();

    expect(cookiesRead).toHaveBeenCalledTimes(1);
    expect(revoked).toHaveBeenCalledTimes(1);
  });

  it('Dado que não há cookie, Quando abre uma página da equipe, Então vai ao login com a volta em next', async () => {
    const { requireStaffPage } = await loadGuards();

    await expect(requireStaffPage({ next: '/mais' })).rejects.toThrow(
      'REDIRECT /login?next=%2Fmais',
    );
  });

  it('Dado cookie adulterado, Quando abre uma página, Então vai ao login dizendo que a sessão expirou', async () => {
    cookieStore.value = 'lixo.assinatura';
    const { requireStaffPage } = await loadGuards();

    await expect(requireStaffPage({ next: '/mais' })).rejects.toThrow(
      'REDIRECT /login?error=session_expired&next=%2Fmais',
    );
  });

  it('Dado sessão de conta revogada (desativada ou clínica suspensa), Quando abre uma página, Então vai ao login como sessão expirada', async () => {
    signedIn('company_admin');
    revoked.mockResolvedValue(true);
    const { requireStaffPage } = await loadGuards();

    await expect(requireStaffPage()).rejects.toThrow(
      'REDIRECT /login?error=session_expired',
    );
  });

  it('Dado next com endereço de outro site, Quando vai ao login, Então o destino é descartado (sem open redirect)', async () => {
    const { requireStaffPage } = await loadGuards();

    await expect(
      requireStaffPage({ next: '//evil.example/x' }),
    ).rejects.toThrow(/^REDIRECT \/login$/);
  });

  it('Dado que AUTH_SECRET não está definido, Quando abre qualquer página protegida, Então falha fechado, sem ler o cookie', async () => {
    signedIn('company_admin');
    vi.stubEnv('AUTH_SECRET', '');
    const { requireStaffPage } = await loadGuards();

    await expect(requireStaffPage()).rejects.toThrow(
      'Autenticação não configurada: defina AUTH_SECRET',
    );
    expect(cookiesRead).not.toHaveBeenCalled();
  });

  it.each<UserRole>(['patient', 'guardian', 'partner', 'super_admin'])(
    'Dado o papel %s, Quando abre uma página da equipe da clínica, Então recebe 403',
    async (role) => {
      signedIn(role);
      const { requireStaffPage } = await loadGuards();

      await expect(requireStaffPage()).rejects.toThrow('FORBIDDEN');
    },
  );

  it('Dado a página restrita ao admin, Quando o atendente abre, Então recebe 403 e o admin entra', async () => {
    const { requireStaffPage } = await loadGuards();
    signedIn('atendente');
    await expect(
      requireStaffPage({ roles: ['company_admin'] }),
    ).rejects.toThrow('FORBIDDEN');

    vi.resetModules();
    signedIn('company_admin');
    const again = await loadGuards();
    await expect(
      again.requireStaffPage({ roles: ['company_admin'] }),
    ).resolves.toMatchObject({ role: 'company_admin' });
  });

  it.each<[UserRole, boolean]>([
    ['patient', true],
    ['guardian', true],
    ['partner', true],
    ['atendente', false],
    ['super_admin', false],
  ])(
    'Dado o papel %s, Quando abre uma página do portal, Então entra=%s',
    async (role, enters) => {
      signedIn(role);
      const { requirePortalPage } = await loadGuards();

      const result = requirePortalPage();

      if (enters) {
        await expect(result).resolves.toMatchObject({ role });
      } else {
        await expect(result).rejects.toThrow('FORBIDDEN');
      }
    },
  );

  it('Dado o portal restrito ao parceiro, Quando o paciente abre, Então recebe 403', async () => {
    signedIn('patient');
    const { requirePortalPage } = await loadGuards();

    await expect(requirePortalPage({ roles: ['partner'] })).rejects.toThrow(
      'FORBIDDEN',
    );
  });

  it('Dado uma página da plataforma, Quando abre o super_admin ou outro papel, Então só o super_admin entra', async () => {
    signedIn('super_admin');
    const platform = await loadGuards();
    await expect(platform.requirePlatformPage()).resolves.toMatchObject({
      role: 'super_admin',
    });

    vi.resetModules();
    signedIn('company_admin');
    const other = await loadGuards();
    await expect(other.requirePlatformPage()).rejects.toThrow('FORBIDDEN');
  });
});
