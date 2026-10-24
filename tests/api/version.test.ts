import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAppReleaseRepository } from '@/infrastructure/persistence/drizzle/drizzle-app-release-repository';
import { appReleases } from '@/infrastructure/persistence/drizzle/schema';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope {
  success: boolean;
  data: { version: string; releasedAt: string | null; sha?: string } | null;
  error: string | null;
}

const get = async (
  headers: Record<string, string> = {},
  path = '/api/version',
) => {
  const route =
    path === '/api/version'
      ? await import('@/app/api/version/route')
      : await import('@/app/api/portal/version/route');
  const response = await route.GET(
    new NextRequest(`http://localhost${path}`, { headers }),
  );
  return { response, json: (await response.json()) as Envelope };
};

const STAFF = cookieHeaderFor('atendente', 'recepcao@a.test');
const PATIENT = cookieHeaderFor('patient', 'paciente@a.test');

describe('Feature: GET /api/version (ADR-066)', () => {
  beforeEach(async () => {
    vi.resetModules();
    await (await getDb()).delete(appReleases);
    vi.stubEnv('NEXT_PUBLIC_RELEASE_VERSION', '0.2.0');
    vi.stubEnv('NEXT_PUBLIC_APP_COMMIT', '');
    vi.stubEnv('APP_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Dado nenhuma sessão, Quando consulta, Então 401', async () => {
    const { response } = await get();

    expect(response.status).toBe(401);
  });

  it('Dado AUTH_SECRET ausente, Quando consulta, Então 503 (falha fechada)', async () => {
    vi.stubEnv('AUTH_SECRET', '');

    const { response } = await get(STAFF);

    expect(response.status).toBe(503);
  });

  it('Dada a equipe e uma release no banco, Quando consulta, Então a versão do banco prevalece', async () => {
    const repo = new DrizzleAppReleaseRepository(await getDb());
    await repo.record({
      version: '0.3.0',
      gitSha: 'abcdef1234',
      notes: null,
      at: new Date('2026-10-23T12:00:00Z'),
    });

    const { response, json } = await get(STAFF);

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      version: '0.3.0',
      releasedAt: '2026-10-23T12:00:00.000Z',
    });
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=300');
  });

  it('Dado o portal do paciente e banco vazio, Quando consulta /api/portal/version, Então a versão do build', async () => {
    const { response, json } = await get(PATIENT, '/api/portal/version');

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ version: '0.2.0', releasedAt: null });
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=300');
  });

  it.each(['patient', 'guardian', 'partner'] as const)(
    'Dado o perfil %s do portal, Quando consulta /api/portal/version, Então 200',
    async (role) => {
      const { response } = await get(
        cookieHeaderFor(role, 'portal@a.test'),
        '/api/portal/version',
      );

      expect(response.status).toBe(200);
    },
  );

  it('Dada a equipe, Quando consulta /api/portal/version, Então 403', async () => {
    const { response } = await get(STAFF, '/api/portal/version');

    expect(response.status).toBe(403);
  });

  it('Dado o paciente, Quando consulta /api/version da equipe, Então 403', async () => {
    const { response } = await get(PATIENT);

    expect(response.status).toBe(403);
  });

  it('Dado o portal sem versão alguma, Quando consulta, Então 404', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_VERSION', '');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');

    const { response } = await get(PATIENT, '/api/portal/version');

    expect(response.status).toBe(404);
  });

  it('Dado o portal sem sessão, Quando consulta, Então 401', async () => {
    const { response } = await get({}, '/api/portal/version');

    expect(response.status).toBe(401);
  });

  it('Dada homologação, Quando consulta, Então o SHA vem junto', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('NEXT_PUBLIC_APP_COMMIT', 'abcdef1234');

    const { json } = await get(STAFF);

    expect(json.data?.sha).toBe('abcdef1234');
  });

  it('Dada produção, Quando consulta, Então o SHA nunca vem', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_COMMIT', 'abcdef1234');

    const { json } = await get(STAFF);

    expect(json.data).not.toHaveProperty('sha');
  });

  it('Dada a segunda chamada, Quando consulta, Então não vai ao banco', async () => {
    const { DrizzleAppReleaseRepository: Repo } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-app-release-repository'
    );
    const latest = vi.spyOn(Repo.prototype, 'latest');

    await get(STAFF);
    await get(STAFF);

    expect(latest).toHaveBeenCalledTimes(1);
    latest.mockRestore();
  });

  it('Dado nenhuma versão válida no build nem no banco, Quando consulta, Então 404', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_VERSION', '');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');

    const { response } = await get(STAFF);

    expect(response.status).toBe(404);
  });
});
