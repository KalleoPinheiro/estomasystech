import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });
let counter = 0;
const unique = (prefix: string) => {
  counter += 1;
  return `${prefix}-${counter}-${Date.now()}@x.com`;
};

async function createPatient(email: string, fullName: string, extra = {}) {
  const route = await import('@/app/api/patients/route');
  const response = await route.POST(
    jsonRequest('/api/patients', 'POST', {
      fullName,
      email,
      phone: '11911112222',
      ...extra,
    }),
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as Envelope<{ id: string }>).data.id;
}

async function createPartner(email: string, fullName: string) {
  const route = await import('@/app/api/partners/route');
  const response = await route.POST(
    jsonRequest('/api/partners', 'POST', {
      fullName,
      email,
      phone: '11933334444',
    }),
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as Envelope<{ id: string }>).data.id;
}

/** Conta de portal criada pela equipe, como na tela de Contas. */
async function createPortalAccount(body: Record<string, unknown>) {
  const route = await import('@/app/api/accounts/route');
  const response = await route.POST(
    jsonRequest(
      '/api/accounts',
      'POST',
      body,
      cookieHeaderFor('company_admin', 'admin-portal-id@x.com', CLINIC_A_ID),
    ),
  );
  expect(response.status).toBe(200);
}

async function correctPatientEmail(id: string, email: string) {
  const route = await import('@/app/api/patients/[id]/route');
  const response = await route.PUT(
    jsonRequest(`/api/patients/${id}`, 'PUT', { email }),
    context(id),
  );
  expect(response.status).toBe(200);
}

async function patientPortal(email: string) {
  const route = await import('@/app/api/portal/patient/route');
  const response = await route.GET(
    new NextRequest('http://localhost/api/portal/patient', {
      headers: cookieHeaderFor('patient', email, CLINIC_A_ID),
    }),
  );
  return {
    status: response.status,
    body: (await response.json()) as Envelope<{
      patient: { id: string; fullName: string };
    }>,
  };
}

describe('Feature: Portal resolve o titular pelo vínculo da conta (#196)', () => {
  it('reused email never exposes another patient: A corrige o e-mail, B herda o antigo, a conta de A continua vendo só A', async () => {
    await ensureTestClinics();
    const loginEmail = unique('familia');
    const patientA = await createPatient(loginEmail, 'Ana Titular');
    await createPortalAccount({
      email: loginEmail,
      role: 'patient',
      patientId: patientA,
    });

    await correctPatientEmail(patientA, unique('ana-corrigido'));
    const patientB = await createPatient(loginEmail, 'Bruna Outra Pessoa');

    const { status, body } = await patientPortal(loginEmail);
    expect(status).toBe(200);
    expect(body.data.patient.id).toBe(patientA);
    expect(body.data.patient.id).not.toBe(patientB);
    expect(JSON.stringify(body.data)).not.toContain('Bruna Outra Pessoa');
  });

  it('email correction keeps access: corrigir o e-mail do cadastro não tira o acesso da conta', async () => {
    await ensureTestClinics();
    const loginEmail = unique('corrige');
    const patientId = await createPatient(loginEmail, 'Carla Corrige');
    await createPortalAccount({
      email: loginEmail,
      role: 'patient',
      patientId,
    });

    await correctPatientEmail(patientId, unique('carla-nova'));

    const { status, body } = await patientPortal(loginEmail);
    expect(status).toBe(200);
    expect(body.data.patient.id).toBe(patientId);
  });

  it('partner resolved by link: e-mail do parceiro reaproveitado não troca os indicados', async () => {
    await ensureTestClinics();
    const loginEmail = unique('parceiro');
    const partnerA = await createPartner(loginEmail, 'Dr. Antigo');
    await createPatient(unique('indicado-a'), 'Indicada Do Antigo', {
      referredByPartnerId: partnerA,
    });
    await createPortalAccount({
      email: loginEmail,
      role: 'partner',
      partnerId: partnerA,
    });

    const partnersById = await import('@/app/api/partners/[id]/route');
    const renamed = await partnersById.PUT(
      jsonRequest(`/api/partners/${partnerA}`, 'PUT', {
        email: unique('dr-antigo-novo'),
      }),
      context(partnerA),
    );
    expect(renamed.status).toBe(200);
    const partnerB = await createPartner(loginEmail, 'Dr. Novo');
    await createPatient(unique('indicado-b'), 'Indicado Do Novo', {
      referredByPartnerId: partnerB,
    });

    const route = await import('@/app/api/portal/partner/route');
    const response = await route.GET(
      new NextRequest('http://localhost/api/portal/partner', {
        headers: cookieHeaderFor('partner', loginEmail, CLINIC_A_ID),
      }),
    );
    const text = JSON.stringify(await response.json());
    expect(response.status).toBe(200);
    expect(text).toContain('Indicada Do Antigo');
    expect(text).not.toContain('Indicado Do Novo');
  });

  it('unlinked account gets 404: conta de portal sem vínculo não casa pelo e-mail do cadastro', async () => {
    await ensureTestClinics();
    const email = unique('orfa');
    await createPatient(email, 'Paciente Com Conta Órfã');
    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    await userAccounts.save(
      UserAccount.create({
        email,
        passwordHash: UNSET_PASSWORD_HASH,
        role: 'patient',
        clinicId: CLINIC_A_ID,
      }),
    );

    const { status } = await patientPortal(email);
    expect(status).toBe(404);
  });

  it('conta de outro papel com o mesmo e-mail não abre o portal do paciente', async () => {
    await ensureTestClinics();
    const email = unique('papel');
    const patientId = await createPatient(email, 'Paciente Papel');
    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    await userAccounts.save(
      UserAccount.create({
        email,
        passwordHash: UNSET_PASSWORD_HASH,
        role: 'partner',
        clinicId: CLINIC_A_ID,
        patientId,
      }),
    );

    expect((await patientPortal(email)).status).toBe(404);
  });
});
