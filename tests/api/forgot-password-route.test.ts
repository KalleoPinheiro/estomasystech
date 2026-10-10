import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { buildUserAccount } from '../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import {
  spyOnSentEmails,
  tokenFromLastEmail,
  waitForEmails,
} from '../support/email';
import {
  clearEmailChannels,
  providerCalls,
  saveEmailChannel,
  stubProviderFetch,
} from '../support/email-channel';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.vitta.test';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

let ipCounter = 100;
const freshIp = (): Record<string, string> => {
  ipCounter += 1;
  return { 'x-forwarded-for': `10.1.0.${ipCounter}` };
};

const createAccount = async (email: string): Promise<void> => {
  await ensureTestClinics();
  const route = await import('@/app/api/accounts/route');
  const emails = spyOnSentEmails();
  try {
    const headers = cookieHeaderFor(
      'company_admin',
      'admin-fp@example.com',
      CLINIC_A_ID,
    );
    await route.POST(
      jsonRequest(
        '/api/accounts',
        'POST',
        { email, role: 'atendente' },
        headers,
      ),
    );
  } finally {
    emails.restore();
  }
};

const forgot = async (
  email: string,
  headers: Record<string, string> = freshIp(),
) => {
  const route = await import('@/app/api/auth/forgot-password/route');
  return route.POST(
    jsonRequest('/api/auth/forgot-password', 'POST', { email }, headers),
  );
};

/**
 * AUTH-10 / AUTH-11: e-mail existente recebe link de reset de 1 h; e-mail
 * inexistente recebe exatamente a mesma resposta, sem envio.
 */
describe('Feature: POST /api/auth/forgot-password', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado uma conta ativa, Quando pedir reset, Então envia e-mail com link e validade de 1 hora', async () => {
    await createAccount('reset-ok@x.com');
    const emails = spyOnSentEmails();

    const response = await forgot('reset-ok@x.com');

    expect(response.status).toBe(200);
    await waitForEmails(emails, 1);
    expect(emails.bodies).toHaveLength(1);
    expect(emails.bodies[0]).toContain('reset-ok@x.com');
    expect(emails.bodies[0]).toContain(
      'https://app.vitta.test/definir-senha?token=',
    );
    expect(emails.bodies[0]).toContain('1 hora');
    emails.restore();
  });

  it('Dado um e-mail inexistente, Quando pedir reset, Então responde igual ao caso existente e não envia nada', async () => {
    await createAccount('existe@x.com');

    const emailsExisting = spyOnSentEmails();
    const existing = await forgot('existe@x.com');
    const existingJson = (await existing.json()) as Envelope<{
      message: string;
    }>;
    await waitForEmails(emailsExisting, 1);
    emailsExisting.restore();

    const emailsMissing = spyOnSentEmails();
    const missing = await forgot('nunca-existiu@x.com');
    const missingJson = (await missing.json()) as Envelope<{ message: string }>;
    // O envio é disparado sem await; espera um ciclo real antes de afirmar
    // que nada saiu, para o teste não passar só por chegar antes do envio.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(missing.status).toBe(existing.status);
    expect(missingJson).toEqual(existingJson);
    expect(emailsMissing.bodies).toHaveLength(0);
    emailsMissing.restore();
  });

  it('Dado uma conta desativada, Quando pedir reset, Então responde 200 sem enviar e-mail', async () => {
    await createAccount('inativa-reset@x.com');
    const { getRepositories } = await import('@/infrastructure/container');
    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    const account = await userAccounts.findByEmail('inativa-reset@x.com');
    if (!account) throw new Error('Conta não encontrada');
    await userAccounts.save(account.deactivate());
    const emails = spyOnSentEmails();

    const response = await forgot('inativa-reset@x.com');

    expect(response.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(emails.bodies).toHaveLength(0);
    emails.restore();
  });

  it('Dado um corpo sem e-mail, Quando pedir reset, Então ainda responde 200 com a mensagem neutra', async () => {
    const route = await import('@/app/api/auth/forgot-password/route');
    const response = await route.POST(
      jsonRequest(
        '/api/auth/forgot-password',
        'POST',
        { naoEhEmail: 1 },
        freshIp(),
      ),
    );
    const json = (await response.json()) as Envelope<{ message: string }>;

    expect(response.status).toBe(200);
    expect(json.data.message).toContain('Se houver uma conta com este e-mail');
  });

  it('Dado o link de reset recebido, Quando usá-lo em set-password, Então define a nova senha', async () => {
    await createAccount('reset-usavel@x.com');
    const emails = spyOnSentEmails();
    await forgot('reset-usavel@x.com');
    await waitForEmails(emails, 1);
    const token = tokenFromLastEmail(emails);
    emails.restore();

    const setPassword = await import('@/app/api/auth/set-password/route');
    const response = await setPassword.POST(
      jsonRequest(
        '/api/auth/set-password',
        'POST',
        { token, password: 'senha-do-reset-1' },
        freshIp(),
      ),
    );

    expect(response.status).toBe(200);
  });

  it('Dado o mesmo e-mail em duas clínicas diferentes, Quando pedir reset, Então envia um link de reset por conta ativa (issue #155)', async () => {
    await ensureTestClinics();
    const { getRepositories } = await import('@/infrastructure/container');
    const email = 'duplicado-reset@x.com';
    const clinicARepos = await getRepositories(clinicScope(CLINIC_A_ID));
    await clinicARepos.userAccounts.save(
      buildUserAccount({ email, clinicId: CLINIC_A_ID }),
    );
    const clinicBRepos = await getRepositories(clinicScope(CLINIC_B_ID));
    await clinicBRepos.userAccounts.save(
      buildUserAccount({ email, clinicId: CLINIC_B_ID }),
    );
    const emails = spyOnSentEmails();

    const response = await forgot(email);

    expect(response.status).toBe(200);
    await waitForEmails(emails, 2);
    expect(emails.bodies).toHaveLength(2);
    emails.restore();
  });

  it('Dado o mesmo e-mail em duas clínicas mas uma conta inativa, Quando pedir reset, Então envia link só pra ativa', async () => {
    await ensureTestClinics();
    const { getRepositories } = await import('@/infrastructure/container');
    const email = 'duplicado-reset-inativa@x.com';
    const clinicARepos = await getRepositories(clinicScope(CLINIC_A_ID));
    await clinicARepos.userAccounts.save(
      buildUserAccount({ email, clinicId: CLINIC_A_ID }).deactivate(),
    );
    const clinicBRepos = await getRepositories(clinicScope(CLINIC_B_ID));
    await clinicBRepos.userAccounts.save(
      buildUserAccount({ email, clinicId: CLINIC_B_ID }),
    );
    const emails = spyOnSentEmails();

    const response = await forgot(email);

    expect(response.status).toBe(200);
    await waitForEmails(emails, 1);
    expect(emails.bodies).toHaveLength(1);
    emails.restore();
  });

  it('Dado seis pedidos do mesmo IP em um minuto, Quando o sexto chegar, Então responde 429', async () => {
    const sameIp = { 'x-forwarded-for': '10.8.8.8' };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await forgot('qualquer@x.com', sameIp)).status);
    }

    expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  describe('C2/#265 pelo canal da conta', () => {
    afterEach(async () => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await clearEmailChannels();
    });

    /** Dá um ciclo real ao envio disparado sem await antes de afirmar o total. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

    it('canal da conta: conta da clínica com canal recebe pela chave dela; a da clínica sem canal não recebe nada', async () => {
      await ensureTestClinics();
      const { getRepositories } = await import('@/infrastructure/container');
      const email = 'canal-da-conta@x.com';
      await (await getRepositories(clinicScope(CLINIC_A_ID))).userAccounts.save(
        buildUserAccount({ email, clinicId: CLINIC_A_ID }),
      );
      await (await getRepositories(clinicScope(CLINIC_B_ID))).userAccounts.save(
        buildUserAccount({ email, clinicId: CLINIC_B_ID }),
      );
      await saveEmailChannel(CLINIC_A_ID, 're_chave_da_A');
      const fetchMock = stubProviderFetch(200);
      vi.spyOn(console, 'info').mockImplementation(() => undefined);

      const response = await forgot(email);
      const json = (await response.json()) as Envelope<{ message: string }>;

      expect(response.status).toBe(200);
      expect(json.data).toEqual({
        message:
          'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.',
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await settle();
      expect(providerCalls(fetchMock)).toEqual([
        expect.objectContaining({ auth: 'Bearer re_chave_da_A', to: email }),
      ]);
    });

    const superAdminEmail = async (): Promise<string> => {
      const { getRepositories } = await import('@/infrastructure/container');
      const { userAccounts } = await getRepositories(systemScope());
      const [existing] = await userAccounts.findByRole('super_admin');
      if (existing) return existing.email;
      const created = UserAccount.create({
        email: 'dono-reset@vitta.app',
        passwordHash: 'scrypt$1$abc$def',
        role: 'super_admin',
        clinicId: null,
      });
      await userAccounts.save(created);
      return created.email;
    };

    it('super admin: sai pela chave da plataforma quando existe; sem ela, nada sai', async () => {
      const email = await superAdminEmail();
      vi.spyOn(console, 'info').mockImplementation(() => undefined);

      vi.stubEnv('RESEND_API_KEY', 're_chave_plataforma');
      vi.stubEnv('EMAIL_FROM', 'Vitta <nao-responda@vitta.app>');
      const withPlatform = stubProviderFetch(200);
      const first = await forgot(email);
      await vi.waitFor(() => expect(withPlatform).toHaveBeenCalled());
      await settle();
      expect(providerCalls(withPlatform)).toEqual([
        expect.objectContaining({
          auth: 'Bearer re_chave_plataforma',
          to: email,
        }),
      ]);

      vi.unstubAllEnvs();
      const withoutPlatform = stubProviderFetch(200);
      const second = await forgot(email);
      await settle();
      expect(withoutPlatform).not.toHaveBeenCalled();

      expect(second.status).toBe(first.status);
      expect(await second.json()).toEqual(await first.json());
    });
  });
});
