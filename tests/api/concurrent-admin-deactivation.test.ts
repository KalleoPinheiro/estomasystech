import { describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import { getRepositories } from '@/infrastructure/container';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.vitta.test';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const LAST_ADMIN_MESSAGE =
  'Não é possível desativar o último administrador ativo da empresa';

let seq = 0;

/** Clínica nova e isolada, para não interferir com admins de outros testes. */
const freshClinic = async (): Promise<string> => {
  const id = `corrida-admin-${++seq}`;
  const { clinics } = await getRepositories(systemScope());
  await clinics.create(
    Clinic.restore({
      id,
      name: 'Clínica da corrida de admins',
      createdBy: 'test',
      createdAt: new Date(),
    }),
  );
  return id;
};

const seedAdmin = async (clinicId: string, email: string) => {
  const { userAccounts } = await getRepositories(clinicScope(clinicId));
  const account = UserAccount.create({
    email,
    passwordHash: UNSET_PASSWORD_HASH,
    role: 'company_admin',
    clinicId,
  });
  await userAccounts.save(account);
  return account;
};

const activeAdminCount = async (clinicId: string): Promise<number> => {
  const { userAccounts } = await getRepositories(clinicScope(clinicId));
  const admins = await userAccounts.findByRole('company_admin');
  return admins.filter((a) => a.isActive).length;
};

/**
 * Issue #244: a regra "não desativar o último `company_admin` ativo"
 * (`assertCanDeactivate`) lia as contas e só depois gravava. Duas
 * desativações concorrentes de admins diferentes da mesma clínica liam o
 * mesmo estado, as duas passavam na checagem e a clínica ficava sem admin
 * ativo. `findByRoleForUpdate` (`SELECT ... FOR UPDATE`) dentro da mesma
 * transação que grava fecha a corrida nos dois caminhos: plataforma e
 * self-service da clínica.
 */
describe('Feature: desativação atômica do último admin (#244)', () => {
  it('P1: plataforma — duas desativações concorrentes de admins diferentes, exatamente uma passa', async () => {
    const clinicId = await freshClinic();
    const admins = await Promise.all([
      seedAdmin(clinicId, `p1-a-${seq}@x.com`),
      seedAdmin(clinicId, `p1-b-${seq}@x.com`),
    ]);
    const superAdmin = cookieHeaderFor('super_admin', 'dono@vitta.app', null);
    const route = await import(
      '@/app/api/platform/clinics/[id]/admins/[accountId]/route'
    );
    const deactivate = (accountId: string) =>
      route.PATCH(
        jsonRequest(
          `/api/platform/clinics/${clinicId}/admins/${accountId}`,
          'PATCH',
          { action: 'deactivate' },
          superAdmin,
        ),
        { params: Promise.resolve({ id: clinicId, accountId }) },
      );

    const [a, b] = await Promise.all([
      deactivate(admins[0].id),
      deactivate(admins[1].id),
    ]);
    const [aJson, bJson] = (await Promise.all([a.json(), b.json()])) as [
      Envelope<unknown>,
      Envelope<unknown>,
    ];
    const statuses = [a.status, b.status].sort();

    expect(statuses).toEqual([200, 409]);
    const errors = [aJson, bJson]
      .filter((json) => !json.success)
      .map((json) => json.error);
    expect(errors).toEqual([LAST_ADMIN_MESSAGE]);
    expect(await activeAdminCount(clinicId)).toBe(1);
  });

  it('P2: clínica (self-service) — duas desativações concorrentes de admins diferentes, exatamente uma passa', async () => {
    const clinicId = await freshClinic();
    const [leaving1, leaving2] = await Promise.all([
      seedAdmin(clinicId, `p2-a-${seq}@x.com`),
      seedAdmin(clinicId, `p2-b-${seq}@x.com`),
    ]);
    const actor = cookieHeaderFor(
      'company_admin',
      `p2-ator-${seq}@x.com`,
      clinicId,
    );
    const route = await import('@/app/api/accounts/[id]/route');
    const deactivate = (accountId: string) =>
      route.PATCH(
        jsonRequest(
          `/api/accounts/${accountId}`,
          'PATCH',
          { active: false },
          actor,
        ),
        { params: Promise.resolve({ id: accountId }) },
      );

    const [a, b] = await Promise.all([
      deactivate(leaving1.id),
      deactivate(leaving2.id),
    ]);
    const [aJson, bJson] = (await Promise.all([a.json(), b.json()])) as [
      Envelope<unknown>,
      Envelope<unknown>,
    ];
    const statuses = [a.status, b.status].sort();

    expect(statuses).toEqual([200, 409]);
    const errors = [aJson, bJson]
      .filter((json) => !json.success)
      .map((json) => json.error);
    expect(errors).toEqual([LAST_ADMIN_MESSAGE]);
    expect(await activeAdminCount(clinicId)).toBe(1);
  });
});
