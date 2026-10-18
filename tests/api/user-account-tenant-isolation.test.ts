import { describe, expect, it } from 'vitest';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { seedPortalRecord } from '../support/portal-account';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Isolamento de Conta de Usuário e e-mail único por empresa (MT-24)', () => {
  const createAccount = async (clinicId: string, email: string) => {
    const route = await import('@/app/api/accounts/route');
    const response = await route.POST(
      jsonRequest(
        '/api/accounts',
        'POST',
        {
          email,
          password: 'senha-forte-123',
          role: 'patient',
          patientId: await seedPortalRecord('patient', clinicId),
        },
        adminCookieHeader(clinicId),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return { response, body };
  };

  it('Dado o mesmo e-mail em duas clínicas distintas, Quando criar em ambas, Então não colide (unicidade composta)', async () => {
    await ensureTestClinics();
    const sharedEmail = 'conta-compartilhada@x.com';

    const first = await createAccount(CLINIC_A_ID, sharedEmail);
    const second = await createAccount(CLINIC_B_ID, sharedEmail);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(first.body.data.id).not.toBe(second.body.data.id);
  });

  it('Dada sessão da clínica A, Quando GET /api/accounts, Então lista não inclui conta exclusiva da clínica B', async () => {
    await ensureTestClinics();
    const { body: created } = await createAccount(
      CLINIC_B_ID,
      'conta-exclusiva-b@x.com',
    );

    const route = await import('@/app/api/accounts/route');
    const response = await route.GET(
      jsonRequest(
        '/api/accounts',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(body.data.some((a) => a.id === created.data.id)).toBe(false);
  });

  it('Dada sessão da clínica A, Quando PATCH em conta da clínica B, Então 404', async () => {
    await ensureTestClinics();
    const { body: created } = await createAccount(
      CLINIC_B_ID,
      'conta-so-edita-propria@x.com',
    );

    const byIdRoute = await import('@/app/api/accounts/[id]/route');
    const response = await byIdRoute.PATCH(
      jsonRequest(
        `/api/accounts/${created.data.id}`,
        'PATCH',
        { active: false },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: created.data.id }) },
    );

    expect(response.status).toBe(404);
  });
});
