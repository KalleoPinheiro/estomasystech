import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { clearEmailChannels } from '../support/email-channel';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope {
  success: boolean;
  data: { delivered?: boolean; inviteUrl?: string | null } | null;
  error: string | null;
}

const ADMIN = cookieHeaderFor(
  'company_admin',
  'admin-appurl@a.test',
  CLINIC_A_ID,
);

const invite = async (email: string) => {
  const route = await import('@/app/api/accounts/route');
  const response = await route.POST(
    jsonRequest('/api/accounts', 'POST', { email, role: 'atendente' }, ADMIN),
  );
  return { response, json: (await response.json()) as Envelope };
};

const accountsOf = async (email: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
  return userAccounts.findAllByEmail(email);
};

/**
 * #467: na homologação o convite de `erro@` respondia 500 depois de criar a
 * conta, porque `APP_URL` não valia em produção. A falha agora vem antes de
 * gravar e, na Vercel, o domínio de produção da própria Vercel serve de base.
 */
describe('Feature: convite com a URL pública do ambiente (#467)', () => {
  beforeAll(async () => {
    await ensureTestClinics();
    await clearEmailChannels();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('Dada produção sem APP_URL, Quando convidar, Então recusa e a conta não é criada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'ab'.repeat(32));
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('VERCEL', '');

    const { response } = await invite('sem-url@a.test');

    expect(response.status).toBe(500);
    expect(await accountsOf('sem-url@a.test')).toEqual([]);
  });

  it('Dada a Vercel sem APP_URL, Quando convidar (clínica sem canal), Então devolve o link no domínio da Vercel', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'ab'.repeat(32));
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'estomasystech.vercel.app');

    const { response, json } = await invite('na-vercel@a.test');

    expect(response.status).toBe(200);
    expect(json.data?.delivered).toBe(false);
    expect(json.data?.inviteUrl).toMatch(
      /^https:\/\/estomasystech\.vercel\.app\/definir-senha\?token=[\w-]+$/,
    );
    expect(await accountsOf('na-vercel@a.test')).toHaveLength(1);
  });

  it('Dada APP_URL configurada, Então ela vence o domínio da Vercel', async () => {
    vi.stubEnv('APP_URL', 'https://app.clinica.test');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'estomasystech.vercel.app');

    const { json } = await invite('com-url@a.test');

    expect(json.data?.inviteUrl).toMatch(/^https:\/\/app\.clinica\.test\//);
  });
});
