import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVALID_TOKEN_MESSAGE } from '@/application/auth/auth-token-flow';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import {
  spyOnSentEmails,
  tokenFromLastEmail,
  waitForEmails,
} from '../support/email';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.estomasystech.test';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/** Cadastra uma conta e devolve o segredo do link de convite enviado. */
const inviteFor = async (email: string): Promise<string> => {
  await ensureTestClinics();
  const accounts = await import('@/app/api/accounts/route');
  const emails = spyOnSentEmails();
  try {
    const headers = cookieHeaderFor(
      'company_admin',
      'admin-sp@example.com',
      CLINIC_A_ID,
    );
    const response = await accounts.POST(
      jsonRequest(
        '/api/accounts',
        'POST',
        { email, role: 'atendente' },
        headers,
      ),
    );
    expect(response.status).toBe(200);
    // why: envio de e-mail é fire-and-forget (rota responde antes de despachar) —
    // sem esperar, a leitura corre contra o envio assíncrono (flake sob carga).
    await waitForEmails(emails, 1);
    return tokenFromLastEmail(emails);
  } finally {
    emails.restore();
  }
};

let ipCounter = 0;
/** Um IP por chamada: o limite de 5/min é por IP e não deve vazar entre casos. */
const freshIp = (): Record<string, string> => {
  ipCounter += 1;
  return { 'x-forwarded-for': `10.0.0.${ipCounter}` };
};

const setPassword = async (
  token: string,
  password: string,
  headers: Record<string, string> = freshIp(),
) => {
  const route = await import('@/app/api/auth/set-password/route');
  return route.POST(
    jsonRequest('/api/auth/set-password', 'POST', { token, password }, headers),
  );
};

const login = async (email: string, password: string) => {
  const route = await import('@/app/api/auth/login/route');
  return route.POST(
    jsonRequest('/api/auth/login', 'POST', { email, password }),
  );
};

/**
 * AUTH-05 / AUTH-06 / AUTH-07: um link válido define a senha e habilita o
 * login; expirado, já usado ou inexistente respondem 400 com a mesma mensagem.
 */
describe('Feature: POST /api/auth/set-password', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('Dado um token de convite válido, Quando definir a senha, Então responde 200', async () => {
    const token = await inviteFor('define-ok@x.com');

    const response = await setPassword(token, 'senha-forte-1');

    expect(response.status).toBe(200);
  });

  it('Dado a senha definida pelo convite, Quando fizer login com ela, Então responde 200 e emite cookie de sessão', async () => {
    const token = await inviteFor('login-apos-convite@x.com');
    await setPassword(token, 'senha-forte-2');

    const response = await login('login-apos-convite@x.com', 'senha-forte-2');

    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('estomasystech_session=');

    // O cookie precisa carregar o papel gravado na conta (a conta foi criada
    // com role "atendente"), não um valor fixo — AUTH-06.
    const { verifySessionToken } = await import('@/lib/auth/session');
    const sessionToken =
      cookie.match(/estomasystech_session=([^;]+)/)?.[1] ?? '';
    const session = verifySessionToken(
      process.env.AUTH_SECRET as string,
      sessionToken,
    );
    expect(session?.role).toBe('atendente');
    expect(session?.subject).toBe('login-apos-convite@x.com');
  });

  it('Dado a senha definida, Quando fizer login com outra senha, Então responde 401', async () => {
    const token = await inviteFor('senha-errada@x.com');
    await setPassword(token, 'senha-forte-3');

    const response = await login('senha-errada@x.com', 'senha-errada-9');

    expect(response.status).toBe(401);
  });

  it('Dado o mesmo token usado duas vezes, Quando repetir, Então responde 400 com a mensagem de link inválido', async () => {
    const token = await inviteFor('token-reusado@x.com');
    await setPassword(token, 'senha-forte-4');

    const response = await setPassword(token, 'outra-senha-8');
    const json = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(json.error).toBe(INVALID_TOKEN_MESSAGE);
  });

  it('Dado um token que nunca existiu, Quando definir a senha, Então responde 400 com a mensagem de link inválido', async () => {
    const response = await setPassword(
      'token-inventado-abcdef',
      'senha-forte-5',
    );
    const json = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(json.error).toBe(INVALID_TOKEN_MESSAGE);
  });

  it('Dado um token de convite expirado (24 h + 1 ms), Quando definir a senha, Então responde 400 com a mensagem de link inválido', async () => {
    const token = await inviteFor('token-expirado@x.com');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000 + 1));

    const response = await setPassword(token, 'senha-forte-6');
    const json = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(json.error).toBe(INVALID_TOKEN_MESSAGE);
  });

  it('Dado uma senha com menos de 8 caracteres, Quando definir, Então responde 400 e o token continua utilizável', async () => {
    const token = await inviteFor('senha-curta@x.com');

    const short = await setPassword(token, 'curta7');
    expect(short.status).toBe(400);

    const retry = await setPassword(token, 'senha-forte-7');
    expect(retry.status).toBe(200);
  });

  it('Dado uma conta desativada, Quando usar o convite dela, Então responde 400 com a mensagem de link inválido', async () => {
    const token = await inviteFor('conta-inativa@x.com');
    const { getRepositories } = await import('@/infrastructure/container');
    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    const account = await userAccounts.findByEmail('conta-inativa@x.com');
    if (!account) throw new Error('Conta não encontrada');
    await userAccounts.save(account.deactivate());

    const response = await setPassword(token, 'senha-forte-8');
    const json = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(json.error).toBe(INVALID_TOKEN_MESSAGE);
  });

  it("Dado consumo de token de convite, Quando definir a senha, Então registra evento de auditoria com detail 'invite' (#71)", async () => {
    const token = await inviteFor('audit-invite@x.com');
    const { getRepositories } = await import('@/infrastructure/container');
    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));

    const response = await setPassword(token, 'senha-forte-audit-1');

    expect(response.status).toBe(200);
    const events = await auditEvents.findAll();
    const event = events.find(
      (e) =>
        e.resourceType === 'account-password' &&
        e.actorId === 'audit-invite@x.com',
    );
    expect(event).toBeDefined();
    expect(event?.action).toBe('update');
    expect(event?.detail).toBe('invite');
  });

  it("Dado consumo de token de reset, Quando definir a senha, Então registra evento de auditoria com detail 'reset' (#71)", async () => {
    const inviteToken = await inviteFor('audit-reset@x.com');
    await setPassword(inviteToken, 'senha-forte-audit-2');

    const { getRepositories } = await import('@/infrastructure/container');
    const { authTokens, userAccounts, auditEvents } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    const { AuthToken } = await import('@/domain/auth/auth-token');
    const account = await userAccounts.findByEmail('audit-reset@x.com');
    if (!account) throw new Error('Conta não encontrada');
    const { token: resetToken, secret } = AuthToken.issue({
      accountId: account.id,
      purpose: 'reset',
      nowMs: Date.now(),
    });
    await authTokens.replaceUnused(resetToken, new Date());

    const response = await setPassword(secret, 'senha-forte-audit-3');

    expect(response.status).toBe(200);
    const events = await auditEvents.findAll();
    const event = events.find(
      (e) =>
        e.resourceType === 'account-password' &&
        e.actorId === 'audit-reset@x.com' &&
        e.detail === 'reset',
    );
    expect(event).toBeDefined();
    expect(event?.action).toBe('update');
  });

  it('Dado token inválido/expirado, Quando definir a senha, Então não registra evento de auditoria (#71)', async () => {
    const { getRepositories } = await import('@/infrastructure/container');
    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    const before = (await auditEvents.findAll()).length;

    const response = await setPassword(
      'token-invalido-para-auditoria',
      'senha-forte-audit-4',
    );

    expect(response.status).toBe(400);
    const after = await auditEvents.findAll();
    expect(after).toHaveLength(before);
  });

  it('Dado seis tentativas no mesmo minuto, Quando a sexta chegar, Então responde 429', async () => {
    const sameIp = { 'x-forwarded-for': '10.9.9.9' };
    const attempts: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await setPassword(
        `token-forca-bruta-${i}`,
        'senha-forte-9',
        sameIp,
      );
      attempts.push(response.status);
    }

    expect(attempts.slice(0, 5).every((status) => status === 400)).toBe(true);
    expect(attempts[5]).toBe(429);
  });
});
