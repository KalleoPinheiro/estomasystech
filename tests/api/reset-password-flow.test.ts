import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { INVALID_TOKEN_MESSAGE } from '@/application/auth/auth-token-flow';
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

let ipCounter = 200;
const freshIp = (): Record<string, string> => {
  ipCounter += 1;
  return { 'x-forwarded-for': `10.2.0.${ipCounter}` };
};

/** Cria a conta, consome o convite e deixa a senha inicial definida. */
const accountWithPassword = async (
  email: string,
  password: string,
): Promise<void> => {
  await ensureTestClinics();
  const accounts = await import('@/app/api/accounts/route');
  const setPassword = await import('@/app/api/auth/set-password/route');
  const emails = spyOnSentEmails();
  try {
    const headers = cookieHeaderFor(
      'company_admin',
      'admin-rf@example.com',
      CLINIC_A_ID,
    );
    await accounts.POST(
      jsonRequest(
        '/api/accounts',
        'POST',
        { email, role: 'atendente' },
        headers,
      ),
    );
    // why: envio de e-mail é fire-and-forget (rota responde antes de despachar) —
    // sem esperar, a leitura corre contra o envio assíncrono (flake sob carga).
    await waitForEmails(emails, 1);
    const invite = tokenFromLastEmail(emails);
    const response = await setPassword.POST(
      jsonRequest(
        '/api/auth/set-password',
        'POST',
        { token: invite, password },
        freshIp(),
      ),
    );
    expect(response.status).toBe(200);
  } finally {
    emails.restore();
  }
};

const requestReset = async (email: string): Promise<string> => {
  const route = await import('@/app/api/auth/forgot-password/route');
  const emails = spyOnSentEmails();
  try {
    await route.POST(
      jsonRequest('/api/auth/forgot-password', 'POST', { email }, freshIp()),
    );
    // O envio do reset não é aguardado pela rota (ver CWE-204 na própria rota).
    await waitForEmails(emails, 1);
    return tokenFromLastEmail(emails);
  } finally {
    emails.restore();
  }
};

const setPasswordWith = async (token: string, password: string) => {
  const route = await import('@/app/api/auth/set-password/route');
  return route.POST(
    jsonRequest(
      '/api/auth/set-password',
      'POST',
      { token, password },
      freshIp(),
    ),
  );
};

const login = async (email: string, password: string) => {
  const route = await import('@/app/api/auth/login/route');
  return route.POST(
    jsonRequest('/api/auth/login', 'POST', { email, password }),
  );
};

/**
 * AUTH-12 / AUTH-13 / AUTH-14: o reset troca a senha de fato (a antiga deixa
 * de valer), o link é de uso único e com validade de 1 h, e emitir um novo
 * reset invalida o anterior.
 */
describe('Feature: Ciclo completo de reset de senha', () => {
  // why: a partida fria (banco em memória, migrações e os módulos das rotas) caía
  // dentro do orçamento do primeiro `it` e estourava os 20 s sob CPU saturada (#604).
  // Aquecer no hook tira esse custo do teste sem mexer em timeout nem em asserção.
  beforeAll(async () => {
    await ensureTestClinics();
    await Promise.all([
      import('@/app/api/accounts/route'),
      import('@/app/api/auth/set-password/route'),
      import('@/app/api/auth/forgot-password/route'),
      import('@/app/api/auth/login/route'),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('Dado um reset concluído, Quando logar com a senha nova, Então 200; com a antiga, 401', async () => {
    await accountWithPassword('ciclo-reset@x.com', 'senha-antiga-1');
    const token = await requestReset('ciclo-reset@x.com');

    expect((await setPasswordWith(token, 'senha-nova-1')).status).toBe(200);

    expect((await login('ciclo-reset@x.com', 'senha-nova-1')).status).toBe(200);
    expect((await login('ciclo-reset@x.com', 'senha-antiga-1')).status).toBe(
      401,
    );
  });

  it('Dado um link de reset já usado, Quando usá-lo de novo, Então 400 com a mensagem única', async () => {
    await accountWithPassword('reset-uso-unico@x.com', 'senha-antiga-2');
    const token = await requestReset('reset-uso-unico@x.com');
    await setPasswordWith(token, 'senha-nova-2');

    const response = await setPasswordWith(token, 'senha-nova-2b');
    const json = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(json.error).toBe(INVALID_TOKEN_MESSAGE);
  });

  it('Dado um link de reset com mais de 1 h, Quando usá-lo, Então 400 com a mensagem única', async () => {
    await accountWithPassword('reset-expira@x.com', 'senha-antiga-3');
    const token = await requestReset('reset-expira@x.com');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 60 * 60 * 1000 + 1));

    const response = await setPasswordWith(token, 'senha-nova-3');
    const json = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(json.error).toBe(INVALID_TOKEN_MESSAGE);
  });

  it('Dado um link de reset com 59 minutos, Quando usá-lo, Então ainda vale (fronteira da validade)', async () => {
    await accountWithPassword('reset-quase@x.com', 'senha-antiga-4');
    const token = await requestReset('reset-quase@x.com');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 59 * 60 * 1000));

    expect((await setPasswordWith(token, 'senha-nova-4')).status).toBe(200);
  });

  it('Dado um segundo pedido de reset, Quando usar o primeiro link, Então 400 e o segundo continua válido', async () => {
    await accountWithPassword('reset-reemitido@x.com', 'senha-antiga-5');
    const first = await requestReset('reset-reemitido@x.com');
    const second = await requestReset('reset-reemitido@x.com');

    const stale = await setPasswordWith(first, 'senha-nova-5');
    const staleJson = (await stale.json()) as Envelope<null>;

    expect(stale.status).toBe(400);
    expect(staleJson.error).toBe(INVALID_TOKEN_MESSAGE);
    expect((await setPasswordWith(second, 'senha-nova-5b')).status).toBe(200);
    expect((await login('reset-reemitido@x.com', 'senha-nova-5b')).status).toBe(
      200,
    );
  });
});
