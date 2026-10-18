import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ANONYMIZED_ACCOUNT_REACTIVATION,
  UserAccount,
} from '@/domain/auth/user-account';
import {
  ANONYMIZED_PATIENT_REACTIVATION,
  Patient,
} from '@/domain/patient/patient';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface AccountDto {
  id: string;
  active: boolean;
  anonymized: boolean;
}
interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const admin = () =>
  cookieHeaderFor('company_admin', 'admin-ret@x.com', CLINIC_A_ID);

async function seedInactive(email: string, anonymized: boolean) {
  const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
  const account = UserAccount.create({
    email,
    passwordHash: UNSET_PASSWORD_HASH,
    role: 'atendente',
    clinicId: CLINIC_A_ID,
  }).deactivate();
  await userAccounts.save(account);
  if (anonymized) {
    const db = await getDb();
    await db.execute(
      sql`UPDATE user_accounts SET anonymized_at = now() WHERE id = ${account.id}`,
    );
  }
  return account;
}

async function reactivate(id: string) {
  const route = await import('@/app/api/accounts/[id]/route');
  const response = await route.PATCH(
    jsonRequest(`/api/accounts/${id}`, 'PATCH', { active: true }, admin()),
    { params: Promise.resolve({ id }) },
  );
  return {
    response,
    json: (await response.json()) as Envelope<AccountDto>,
  };
}

describe('Feature: reativação de conta anonimizada (#311)', () => {
  beforeAll(async () => {
    await ensureTestClinics();
  });

  it('Dada conta anonimizada, Quando o Admin tenta reativar, Então 409 com a mensagem clara e a conta segue inativa (RES-07)', async () => {
    const account = await seedInactive('anon-1@x.com', true);

    const { response, json } = await reactivate(account.id);

    expect(response.status).toBe(409);
    expect(json.error).toBe(ANONYMIZED_ACCOUNT_REACTIVATION);
    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    const stored = (await userAccounts.findAll()).find(
      (a) => a.id === account.id,
    );
    expect(stored?.isActive).toBe(false);
  });

  it('Dada conta desativada comum, Quando o Admin reativa, Então reativa (a regra só vale para anonimizada)', async () => {
    const account = await seedInactive('comum-1@x.com', false);

    const { response, json } = await reactivate(account.id);

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ active: true, anonymized: false });
  });

  it('Dada conta anonimizada, Quando lista as contas, Então o DTO marca anonymized para a tela esconder "Reativar"', async () => {
    const account = await seedInactive('anon-2@x.com', true);
    const route = await import('@/app/api/accounts/route');

    const response = await route.GET(
      jsonRequest('/api/accounts', 'GET', undefined, admin()),
    );
    const json = (await response.json()) as Envelope<AccountDto[]>;

    expect(json.data.find((a) => a.id === account.id)?.anonymized).toBe(true);
  });

  it('Dada conta anonimizada, Quando o Admin reenvia convite ou gera link de redefinição, Então recusa e nenhum link é emitido (ADR-017)', async () => {
    const account = await seedInactive('anon-3@x.com', true);
    const ctx = { params: Promise.resolve({ id: account.id }) };

    const resend = await import('@/app/api/accounts/[id]/resend-invite/route');
    const resendResponse = await resend.POST(
      jsonRequest(
        `/api/accounts/${account.id}/resend-invite`,
        'POST',
        undefined,
        admin(),
      ),
      ctx,
    );
    const reset = await import('@/app/api/accounts/[id]/reset-link/route');
    const resetResponse = await reset.POST(
      jsonRequest(
        `/api/accounts/${account.id}/reset-link`,
        'POST',
        undefined,
        cookieHeaderFor('company_admin', 'admin-ret-2@x.com', CLINIC_A_ID),
      ),
      ctx,
    );

    expect(resendResponse.status).toBe(400);
    expect(resetResponse.status).toBe(409);
  });
});

describe('Feature: reativação de paciente anonimizado (ADR-017)', () => {
  beforeAll(async () => {
    await ensureTestClinics();
  });

  async function seedPatient(anonymized: boolean) {
    const { patients } = await getRepositories(clinicScope(CLINIC_A_ID));
    const patient = Patient.create({
      fullName: 'Paciente Retenção',
      email: `ret-${anonymized}@x.com`,
      phone: '11999990000',
    }).deactivate();
    await patients.save(patient);
    if (anonymized) {
      const db = await getDb();
      await db.execute(
        sql`UPDATE patients SET anonymized_at = now() WHERE id = ${patient.id}`,
      );
    }
    return patient;
  }

  async function setActive(id: string) {
    const route = await import('@/app/api/patients/[id]/route');
    const response = await route.PATCH(
      jsonRequest(`/api/patients/${id}`, 'PATCH', { active: true }, admin()),
      { params: Promise.resolve({ id }) },
    );
    return {
      response,
      json: (await response.json()) as Envelope<{
        active: boolean;
        anonymized: boolean;
      }>,
    };
  }

  it('Dado paciente anonimizado, Quando a equipe tenta reativar, Então 409 e o cadastro segue inativo', async () => {
    const patient = await seedPatient(true);

    const { response, json } = await setActive(patient.id);

    expect(response.status).toBe(409);
    expect(json.error).toBe(ANONYMIZED_PATIENT_REACTIVATION);
    const { patients } = await getRepositories(clinicScope(CLINIC_A_ID));
    const stored = await patients.findById(patient.id);
    expect(stored?.isActive).toBe(false);
    expect(stored?.isAnonymized).toBe(true);
  });

  it('Dado paciente desativado comum, Quando a equipe reativa, Então reativa (a regra só vale para anonimizado)', async () => {
    const patient = await seedPatient(false);

    const { response, json } = await setActive(patient.id);

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ active: true, anonymized: false });
  });
});
