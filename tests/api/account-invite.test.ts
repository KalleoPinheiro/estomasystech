import { afterEach, describe, expect, it, vi } from 'vitest';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { spyOnSentEmails } from '../support/email';
import { seedPortalRecord } from '../support/portal-account';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.estomasystech.test';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const createAccount = async (body: Record<string, unknown>) => {
  const route = await import('@/app/api/accounts/route');
  const headers = cookieHeaderFor(
    'company_admin',
    'admin-convite@example.com',
    CLINIC_A_ID,
  );
  const response = await route.POST(
    jsonRequest('/api/accounts', 'POST', body, headers),
  );
  const json = (await response.json()) as Envelope<{
    id: string;
    email: string;
    delivered: boolean;
  }>;
  return { response, json };
};

const login = async (email: string, password: string) => {
  const route = await import('@/app/api/auth/login/route');
  return route.POST(
    jsonRequest('/api/auth/login', 'POST', { email, password }),
  );
};

/**
 * AUTH-04 / AUTH-08 / AUTH-09: cadastrar uma conta dispara o convite; a conta
 * não autentica antes de o convite ser consumido; falha de envio não desfaz o
 * cadastro.
 */
describe('Feature: Cadastro de conta dispara convite por e-mail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado um cadastro de conta, Quando POST /api/accounts, Então envia e-mail com link de definição de senha para o endereço da conta', async () => {
    await ensureTestClinics();
    const emails = spyOnSentEmails();

    const { response } = await createAccount({
      email: 'convidada@x.com',
      role: 'atendente',
    });

    expect(response.status).toBe(200);
    expect(emails.bodies).toHaveLength(1);
    expect(emails.bodies[0]).toContain('convidada@x.com');
    expect(emails.bodies[0]).toContain(
      'https://app.estomasystech.test/definir-senha?token=',
    );
    emails.restore();
  });

  it('Dado o canal de e-mail em dry-run, Quando POST /api/accounts, Então delivered é false (issue #52)', async () => {
    await ensureTestClinics();
    const emails = spyOnSentEmails();

    const { json } = await createAccount({
      email: 'dry-run@x.com',
      role: 'atendente',
    });

    expect(json.data.delivered).toBe(false);
    emails.restore();
  });

  it('Dado um cadastro sem campo password, Quando POST /api/accounts, Então responde 200 (senha não é mais aceita no cadastro)', async () => {
    await ensureTestClinics();
    const emails = spyOnSentEmails();

    const { response, json } = await createAccount({
      email: 'sem-senha@x.com',
      role: 'patient',
      patientId: await seedPortalRecord('patient'),
    });

    expect(response.status).toBe(200);
    expect(json.data.email).toBe('sem-senha@x.com');
    emails.restore();
  });

  it('Dado uma conta recém-cadastrada, Quando tentar login antes de consumir o convite, Então responde 401', async () => {
    await ensureTestClinics();
    const emails = spyOnSentEmails();
    await createAccount({ email: 'ainda-sem-senha@x.com', role: 'atendente' });
    emails.restore();

    const response = await login('ainda-sem-senha@x.com', 'qualquer-senha-1');

    expect(response.status).toBe(401);
  });

  it('Dado uma conta recém-cadastrada, Quando tentar login com o hash sentinela como senha, Então responde 401', async () => {
    await ensureTestClinics();
    const emails = spyOnSentEmails();
    await createAccount({ email: 'sentinela@x.com', role: 'atendente' });
    emails.restore();

    // O próprio hash sentinela como senha — importado, não copiado, para o teste
    // acompanhar qualquer mudança do valor.
    const response = await login('sentinela@x.com', UNSET_PASSWORD_HASH);

    expect(response.status).toBe(401);
  });

  it('Dado que o envio do e-mail falha, Quando POST /api/accounts, Então a conta continua criada e a resposta é 200', async () => {
    await ensureTestClinics();
    const { getRepositories } = await import('@/infrastructure/container');
    const { NullEmailGateway } = await import(
      '@/application/ports/email-gateway'
    );
    vi.spyOn(NullEmailGateway.prototype, 'send').mockRejectedValue(
      new Error('provedor fora do ar'),
    );
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const { response, json } = await createAccount({
      email: 'envio-falhou@x.com',
      role: 'patient',
      patientId: await seedPortalRecord('patient'),
    });

    expect(response.status).toBe(200);
    expect(json.data.email).toBe('envio-falhou@x.com');
    expect(json.data.delivered).toBe(false);
    expect(errors).toHaveBeenCalled();

    const services = await getRepositories(clinicScope(CLINIC_A_ID));
    const stored =
      await services.userAccounts.findByEmail('envio-falhou@x.com');
    expect(stored).not.toBeNull();
  });

  it('Dado dois cadastros, Quando POST /api/accounts duas vezes, Então cada conta recebe o próprio convite', async () => {
    await ensureTestClinics();
    const emails = spyOnSentEmails();

    await createAccount({
      email: 'primeira@x.com',
      role: 'patient',
      patientId: await seedPortalRecord('patient'),
    });
    await createAccount({
      email: 'segunda@x.com',
      role: 'partner',
      partnerId: await seedPortalRecord('partner'),
    });

    expect(emails.bodies).toHaveLength(2);
    expect(emails.bodies[0]).toContain('primeira@x.com');
    expect(emails.bodies[1]).toContain('segunda@x.com');
    emails.restore();
  });
});
