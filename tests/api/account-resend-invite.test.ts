import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { spyOnSentEmails } from '../support/email';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.estomasystech.test';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/**
 * Issue #52: conta criada mas com convite não entregue precisa de um jeito de
 * reenviar o link sem cadastrar tudo de novo.
 */
describe('Feature: POST /api/accounts/[id]/resend-invite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createAccount = async (clinicId: string, email: string) => {
    const route = await import('@/app/api/accounts/route');
    const emails = spyOnSentEmails();
    const response = await route.POST(
      jsonRequest(
        '/api/accounts',
        'POST',
        { email, role: 'atendente' },
        adminCookieHeader(clinicId),
      ),
    );
    emails.restore();
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  const resend = async (id: string, clinicId: string) => {
    const route = await import('@/app/api/accounts/[id]/resend-invite/route');
    const response = await route.POST(
      jsonRequest(
        `/api/accounts/${id}/resend-invite`,
        'POST',
        undefined,
        adminCookieHeader(clinicId),
      ),
      { params: Promise.resolve({ id }) },
    );
    const json = (await response.json()) as Envelope<{ delivered: boolean }>;
    return { response, json };
  };

  it('Dada uma conta recém-criada (sem senha), Quando reenviar, Então reemite o convite', async () => {
    await ensureTestClinics();
    const id = await createAccount(CLINIC_A_ID, 'reenvio-convite@x.com');
    const emails = spyOnSentEmails();

    const { response } = await resend(id, CLINIC_A_ID);

    expect(response.status).toBe(200);
    expect(emails.bodies).toHaveLength(1);
    expect(emails.bodies[0]).toContain('reenvio-convite@x.com');
    emails.restore();
  });

  it('Dado que o envio falha, Quando reenviar, Então responde 200 com delivered: false', async () => {
    await ensureTestClinics();
    const id = await createAccount(CLINIC_A_ID, 'reenvio-falha@x.com');
    const { NullEmailGateway } = await import(
      '@/application/ports/email-gateway'
    );
    vi.spyOn(NullEmailGateway.prototype, 'send').mockRejectedValue(
      new Error('provedor fora'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { response, json } = await resend(id, CLINIC_A_ID);

    expect(response.status).toBe(200);
    expect(json.data.delivered).toBe(false);
  });

  it('Dada conta de outra empresa, Quando reenviar, Então 404 (isolamento multi-tenant)', async () => {
    await ensureTestClinics();
    const id = await createAccount(CLINIC_B_ID, 'outra-empresa@x.com');

    const { response } = await resend(id, CLINIC_A_ID);

    expect(response.status).toBe(404);
  });

  it('Dada conta desativada, Quando reenviar, Então 400', async () => {
    await ensureTestClinics();
    const id = await createAccount(CLINIC_A_ID, 'desativada-reenvio@x.com');
    const byIdRoute = await import('@/app/api/accounts/[id]/route');
    await byIdRoute.PATCH(
      jsonRequest(
        `/api/accounts/${id}`,
        'PATCH',
        { active: false },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id }) },
    );

    const { response } = await resend(id, CLINIC_A_ID);

    expect(response.status).toBe(400);
  });

  it('Dado id inexistente, Quando reenviar, Então 404', async () => {
    await ensureTestClinics();

    const { response } = await resend('id-que-nao-existe', CLINIC_A_ID);

    expect(response.status).toBe(404);
  });

  it('Dada nenhuma sessão, Quando reenviar, Então 401', async () => {
    await ensureTestClinics();
    const id = await createAccount(CLINIC_A_ID, 'sem-sessao-reenvio@x.com');
    const route = await import('@/app/api/accounts/[id]/resend-invite/route');

    const response = await route.POST(
      new NextRequest(`http://localhost/api/accounts/${id}/resend-invite`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(401);
  });
});
