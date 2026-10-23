import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { appReleases } from '@/infrastructure/persistence/drizzle/schema';
import { loggedLines } from '../support/log-lines';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const load = async () => {
  vi.resetModules();
  return import('@/infrastructure/release/app-release-service');
};

describe('Feature: Serviço de versão do sistema (ADR-066)', () => {
  beforeEach(async () => {
    await (await getDb()).delete(appReleases);
    vi.stubEnv('DATABASE_URL', 'postgres://local/teste');
    vi.stubEnv('NEXT_PUBLIC_RELEASE_VERSION', '0.2.0');
    vi.stubEnv('NEXT_PUBLIC_APP_COMMIT', '');
    vi.stubEnv('SOURCE_COMMIT', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    vi.stubEnv('APP_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('Dado o boot, Quando grava a release, Então a versão do build fica no banco, e repetir não duplica', async () => {
    const { recordCurrentRelease } = await load();

    await recordCurrentRelease();
    await recordCurrentRelease();

    const rows = await (await getDb()).select().from(appReleases);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: '0.2.0', gitSha: null });
  });

  it.each([
    ['NEXT_PUBLIC_APP_COMMIT', 'aaaaaaa1'],
    ['SOURCE_COMMIT', 'bbbbbbb2'],
    ['VERCEL_GIT_COMMIT_SHA', 'ccccccc3'],
  ])(
    'Dado o SHA em %s, Quando grava, Então vai para git_sha',
    async (name, sha) => {
      vi.stubEnv(name, sha);
      const { recordCurrentRelease } = await load();

      await recordCurrentRelease();

      const [row] = await (await getDb()).select().from(appReleases);
      expect(row.gitSha).toBe(sha);
    },
  );

  it('Dado a versão do build inválida, Quando grava, Então só loga e não lança', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_VERSION', 'lixo');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', 'lixo');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { recordCurrentRelease } = await load();

    await expect(recordCurrentRelease()).resolves.toBeUndefined();

    expect(await (await getDb()).select().from(appReleases)).toEqual([]);
    expect(
      loggedLines(error).some((line) => line.msg === 'release.record_failed'),
    ).toBe(true);
  });

  it('Dado nenhum DATABASE_URL, Quando grava, Então não faz nada', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { recordCurrentRelease } = await load();

    await recordCurrentRelease();

    expect(await (await getDb()).select().from(appReleases)).toEqual([]);
  });

  it('Dado o leitor, Quando lê duas vezes, Então reaproveita o mesmo leitor', async () => {
    const { currentVersionReader } = await load();

    expect(currentVersionReader()).toBe(currentVersionReader());
  });

  it('Dado homologação com release gravada, Quando lê, Então traz o SHA', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    const { recordCurrentRelease, currentVersionReader } = await load();
    vi.stubEnv('NEXT_PUBLIC_APP_COMMIT', 'abcdef1234');
    await recordCurrentRelease();

    expect(await currentVersionReader().read()).toMatchObject({
      version: '0.2.0',
      sha: 'abcdef1234',
    });
  });

  it('Dado produção, Quando lê, Então não traz SHA', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_COMMIT', 'abcdef1234');
    const { recordCurrentRelease, currentVersionReader } = await load();
    await recordCurrentRelease();

    expect(await currentVersionReader().read()).not.toHaveProperty('sha');
  });

  it('Dado APP_ENV inválido, Quando lê, Então nunca expõe o SHA', async () => {
    vi.stubEnv('APP_ENV', 'qualquer');
    vi.stubEnv('NEXT_PUBLIC_APP_COMMIT', 'abcdef1234');
    const { recordCurrentRelease, currentVersionReader } = await load();
    await recordCurrentRelease();

    expect(await currentVersionReader().read()).not.toHaveProperty('sha');
  });
});
