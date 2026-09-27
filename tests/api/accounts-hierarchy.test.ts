import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { getRepositories } from '@/infrastructure/container';
import { DrizzleAuditEventRepository } from '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { spyOnSentEmails } from '../support/email';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.vitta.test';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface AccountDto {
  id: string;
  email: string;
  active: boolean;
  passwordSet: boolean;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

const seed = async (
  role: UserRole,
  email: string,
  clinicId = CLINIC_A_ID,
): Promise<UserAccount> => {
  const { userAccounts } = await getRepositories(clinicScope(clinicId));
  const account = UserAccount.create({
    email,
    passwordHash: UNSET_PASSWORD_HASH,
    role,
    clinicId,
  });
  await userAccounts.save(account);
  return account;
};

const findAccount = async (id: string, clinicId = CLINIC_A_ID) => {
  const { userAccounts } = await getRepositories(clinicScope(clinicId));
  return (await userAccounts.findAll()).find((a) => a.id === id);
};

const as = (role: UserRole, email: string, clinicId = CLINIC_A_ID) =>
  cookieHeaderFor(role, email, clinicId);

const patch = async (
  id: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
) => {
  const route = await import('@/app/api/accounts/[id]/route');
  const response = await route.PATCH(
    jsonRequest(`/api/accounts/${id}`, 'PATCH', body, headers),
    context(id),
  );
  const json = (await response.json()) as Envelope<AccountDto>;
  return { response, json };
};

const resend = async (id: string, headers: Record<string, string>) => {
  const route = await import('@/app/api/accounts/[id]/resend-invite/route');
  const emails = spyOnSentEmails();
  const response = await route.POST(
    jsonRequest(
      `/api/accounts/${id}/resend-invite`,
      'POST',
      undefined,
      headers,
    ),
    context(id),
  );
  emails.restore();
  return response;
};

const list = async (headers: Record<string, string>) => {
  const route = await import('@/app/api/accounts/route');
  const response = await route.GET(
    jsonRequest('/api/accounts', 'GET', undefined, headers),
  );
  const json = (await response.json()) as Envelope<AccountDto[]>;
  return { response, json };
};

const accountAudit = async (id: string, clinicId = CLINIC_A_ID) => {
  const { auditEvents } = await getRepositories(clinicScope(clinicId));
  return auditEvents.findAll({
    resourceType: 'account',
    resourceId: id,
  });
};

describe('Feature: hierarquia na edição de contas (#184)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('C1 atendente não troca a senha do admin', async () => {
    await ensureTestClinics();
    const admin = await seed('company_admin', 'c1-admin@x.com');

    const { response } = await patch(
      admin.id,
      { password: 'hacked-by-reception' },
      as('atendente', 'c1-atendente@x.com'),
    );

    expect(response.status).toBe(403);
    const after = await findAccount(admin.id);
    expect(after?.passwordHash).toBe(UNSET_PASSWORD_HASH);
    expect(await accountAudit(admin.id)).toHaveLength(0);
  });

  it('C2 profissional não desativa o admin', async () => {
    await ensureTestClinics();
    const admin = await seed('company_admin', 'c2-admin@x.com');

    const { response } = await patch(
      admin.id,
      { active: false },
      as('profissional', 'c2-prof@x.com'),
    );

    expect(response.status).toBe(403);
    expect((await findAccount(admin.id))?.isActive).toBe(true);
  });

  it('C3 admin desativa atendente', async () => {
    await ensureTestClinics();
    const atendente = await seed('atendente', 'c3-atendente@x.com');

    const { response, json } = await patch(
      atendente.id,
      { active: false },
      as('company_admin', 'c3-admin@x.com'),
    );

    expect(response.status).toBe(200);
    expect(json.data.active).toBe(false);
  });

  it('C4 atendente desativa paciente', async () => {
    await ensureTestClinics();
    const patient = await seed('patient', 'c4-paciente@x.com');

    const { response, json } = await patch(
      patient.id,
      { active: false },
      as('atendente', 'c4-atendente@x.com'),
    );

    expect(response.status).toBe(200);
    expect(json.data.active).toBe(false);
  });

  it('C5 resend-invite respeita a hierarquia', async () => {
    await ensureTestClinics();
    const admin = await seed('company_admin', 'c5-admin@x.com');
    const patient = await seed('patient', 'c5-paciente@x.com');
    const atendente = as('atendente', 'c5-atendente@x.com');

    expect((await resend(admin.id, atendente)).status).toBe(403);
    expect((await resend(patient.id, atendente)).status).toBe(200);
  });

  it('C6 conta de outra empresa é 404', async () => {
    await ensureTestClinics();
    const otherClinic = await seed(
      'patient',
      'c6-paciente-b@x.com',
      CLINIC_B_ID,
    );
    const admin = as('company_admin', 'c6-admin@x.com');

    const { response } = await patch(otherClinic.id, { active: false }, admin);
    expect(response.status).toBe(404);
    expect((await resend(otherClinic.id, admin)).status).toBe(404);
    expect((await findAccount(otherClinic.id, CLINIC_B_ID))?.isActive).toBe(
      true,
    );
  });

  it('C7 GET filtra pela hierarquia', async () => {
    await ensureTestClinics();
    await seed('company_admin', 'c7-admin@x.com');
    await seed('atendente', 'c7-atendente@x.com');
    await seed('patient', 'c7-paciente@x.com');
    await seed('partner', 'c7-parceiro@x.com');

    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    const roleByEmail = new Map(
      (await userAccounts.findAll()).map((a) => [a.email, a.role]),
    );

    for (const role of ['atendente', 'profissional'] as const) {
      const { response, json } = await list(as(role, `c7-${role}-ator@x.com`));
      expect(response.status).toBe(200);
      const roles = new Set(json.data.map((a) => roleByEmail.get(a.email)));
      expect([...roles].sort()).toEqual(['partner', 'patient']);
    }

    const { json } = await list(as('company_admin', 'c7-admin-ator@x.com'));
    const emails = json.data.map((a) => a.email);
    expect(emails).toContain('c7-admin@x.com');
    expect(emails).toContain('c7-atendente@x.com');
  });

  it('C8 alterações gravam auditoria', async () => {
    await ensureTestClinics();
    const atendente = await seed('atendente', 'c8-atendente@x.com');
    const admin = as('company_admin', 'c8-admin@x.com');

    await patch(atendente.id, { password: 'nova-senha-123' }, admin);
    await patch(atendente.id, { active: false }, admin);
    await patch(atendente.id, { active: true }, admin);
    await resend(atendente.id, admin);

    const events = await accountAudit(atendente.id);
    expect(events.map((e) => e.detail).sort()).toEqual([
      'deactivate',
      'password',
      'reactivate',
      'resend-invite',
    ]);
    for (const event of events) {
      expect(event.action).toBe('update');
      expect(event.actorId).toBe('c8-admin@x.com');
      expect(event.actorRole).toBe('company_admin');
      expect(event.clinicId).toBe(CLINIC_A_ID);
    }
  });

  it('C9 falha de auditoria não altera a conta', async () => {
    await ensureTestClinics();
    const atendente = await seed('atendente', 'c9-atendente@x.com');
    vi.spyOn(DrizzleAuditEventRepository.prototype, 'save').mockRejectedValue(
      new Error('auditoria indisponível'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { response } = await patch(
      atendente.id,
      { active: false, password: 'nova-senha-123' },
      as('company_admin', 'c9-admin@x.com'),
    );

    expect(response.status).toBe(500);
    const after = await findAccount(atendente.id);
    expect(after?.isActive).toBe(true);
    expect(after?.passwordHash).toBe(UNSET_PASSWORD_HASH);
  });

  it('C10 não desativa a própria conta', async () => {
    await ensureTestClinics();
    const self = await seed('company_admin', 'c10-eu@x.com');
    await seed('company_admin', 'c10-outro@x.com');

    const { response, json } = await patch(
      self.id,
      { active: false },
      as('company_admin', 'c10-eu@x.com'),
    );

    expect(response.status).toBe(400);
    expect(json.error).toBe('Não é possível desativar a própria conta');
    expect((await findAccount(self.id))?.isActive).toBe(true);
  });

  it('C11 último admin ativo não é desativado', async () => {
    await ensureTestClinics();
    const only = await seed('company_admin', 'c11-unico@x.com', CLINIC_B_ID);
    const actor = as('company_admin', 'c11-sem-conta@x.com', CLINIC_B_ID);

    const denied = await patch(only.id, { active: false }, actor);
    expect(denied.response.status).toBe(400);
    expect(denied.json.error).toBe(
      'Não é possível desativar o último administrador ativo da empresa',
    );
    expect((await findAccount(only.id, CLINIC_B_ID))?.isActive).toBe(true);

    await seed('company_admin', 'c11-segundo@x.com', CLINIC_B_ID);
    const allowed = await patch(only.id, { active: false }, actor);
    expect(allowed.response.status).toBe(200);
    expect(allowed.json.data.active).toBe(false);
  });
});
