import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { ensureTestClinics } from '../support/clinics';
import { spyOnSentEmails } from '../support/email';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.estomasystech.test';

const SUPER_ADMIN = cookieHeaderFor(
  'super_admin',
  'dono@estomasystech.app',
  null,
);

describe('Feature: Reenvio de acesso pela plataforma a admin que já definiu a senha (B4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado admin com senha já definida, Quando o super_admin pede o reenvio, Então o link emitido é de redefinição de senha, não de convite', async () => {
    await ensureTestClinics();
    const { Clinic } = await import('@/domain/clinic/clinic');
    const { getRepositories } = await import('@/infrastructure/container');
    const clinicId = 'reenvio-com-senha';
    const repos = await getRepositories(clinicScope(clinicId));
    await repos.clinics.create(
      Clinic.restore({
        id: clinicId,
        name: 'Clínica do reenvio',
        createdBy: 'test',
        createdAt: new Date(),
      }),
    );
    const admin = UserAccount.create({
      email: 'admin-com-senha@reenvio.test',
      passwordHash: 'scrypt$1$abc$def',
      role: 'company_admin',
      clinicId,
      professionalId: null,
    });
    await repos.userAccounts.save(admin);
    const emails = spyOnSentEmails();
    const route = await import(
      '@/app/api/platform/clinics/[id]/admins/[accountId]/route'
    );

    const response = await route.PATCH(
      jsonRequest(
        `/api/platform/clinics/${clinicId}/admins/${admin.id}`,
        'PATCH',
        { action: 'resend-invite' },
        SUPER_ADMIN,
      ),
      { params: Promise.resolve({ id: clinicId, accountId: admin.id }) },
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      data: { passwordSet: boolean; inviteUrl: string | null };
    };
    expect(json.data.passwordSet).toBe(true);
    expect(json.data.inviteUrl).toMatch(/token=/);
    expect(emails.bodies).toHaveLength(1);
    expect(emails.bodies[0]).not.toMatch(/convite/i);
  });
});
