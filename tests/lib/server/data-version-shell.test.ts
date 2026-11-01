import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { sessionToken } from '../../support/session';

const read = vi.fn();
const buildIdentity = vi.fn();
const logged = vi.fn();
const cookieStore = { value: undefined as string | undefined };

vi.mock('@/infrastructure/release/app-release-service', () => ({
  currentVersionReader: () => ({ read }),
}));
vi.mock('@/lib/server/data/identity', () => ({
  buildSidebarIdentity: (...args: unknown[]) => buildIdentity(...args),
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
  read.mockReset();
  buildIdentity.mockReset();
  logged.mockClear();
  cookieStore.value = sessionToken('atendente', 'a@clinica.com');
});

describe('Feature: versão do sistema no servidor (ADR-066)', () => {
  it('Dada a release gravada, Quando lê, Então devolve o DTO da rota /api/version (data em ISO)', async () => {
    read.mockResolvedValue({
      version: '0.4.0',
      releasedAt: new Date('2026-10-25T10:00:00Z'),
      sha: 'abc1234',
    });
    const { getAppVersion } = await import('@/lib/server/data/version');

    expect(await getAppVersion()).toEqual({
      version: '0.4.0',
      releasedAt: '2026-10-25T10:00:00.000Z',
      sha: 'abc1234',
    });
  });

  it('Dada a versão do build (sem data nem sha), Quando lê, Então releasedAt é nulo e não há sha', async () => {
    read.mockResolvedValue({ version: '0.4.0', releasedAt: null });
    const { getAppVersion } = await import('@/lib/server/data/version');

    expect(await getAppVersion()).toEqual({
      version: '0.4.0',
      releasedAt: null,
    });
  });

  it('Dado que nem o build tem versão, Quando lê, Então devolve nulo', async () => {
    read.mockResolvedValue(null);
    const { getAppVersion } = await import('@/lib/server/data/version');

    expect(await getAppVersion()).toBeNull();
  });
});

describe('Feature: casco da equipe lido no servidor (ADR-069)', () => {
  it('Dada sessão da equipe, Quando o layout carrega o casco, Então recebe identidade e versão', async () => {
    buildIdentity.mockResolvedValue({ clinicLabel: 'Clínica X' });
    read.mockResolvedValue({ version: '0.4.0', releasedAt: null });
    const { loadStaffShell } = await import('@/lib/server/data/staff-shell');

    const shell = await loadStaffShell();

    expect(shell.identity).toEqual({ clinicLabel: 'Clínica X' });
    expect(shell.version).toEqual({ version: '0.4.0', releasedAt: null });
    expect(buildIdentity.mock.calls[0][0]).toMatchObject({
      role: 'atendente',
    });
  });

  it('Dada falha ao ler identidade e versão, Quando carrega o casco, Então a tela não cai: os campos ficam indefinidos e o erro vai ao log', async () => {
    buildIdentity.mockRejectedValue(new Error('banco fora'));
    read.mockRejectedValue(new Error('banco fora'));
    const { loadStaffShell } = await import('@/lib/server/data/staff-shell');

    const shell = await loadStaffShell();

    expect(shell).toEqual({ identity: undefined, version: undefined });
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it('Dado que não há sessão, Quando carrega o casco, Então redireciona ao login sem ler dado', async () => {
    cookieStore.value = undefined;
    const { loadStaffShell } = await import('@/lib/server/data/staff-shell');

    await expect(loadStaffShell()).rejects.toThrow('REDIRECT /login');
    expect(buildIdentity).not.toHaveBeenCalled();
  });
});
