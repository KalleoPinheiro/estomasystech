import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { Clinic } from '@/domain/clinic/clinic';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { PlatformClinicDto, PlatformClinicSummaryDto } from '@/lib/dto';
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

const OPERATOR = 'dono@vitta.app';
const SUPER_ADMIN = cookieHeaderFor('super_admin', OPERATOR, null);
const SUSPENDED_INVITE =
  'Clínica suspensa: reative a clínica antes de convidar o admin';

const repositories = async (clinicId: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  return getRepositories(clinicScope(clinicId));
};

let seq = 0;

/** Clínica nova com cadastro completo — nada do teste vaza para as demais. */
const freshClinic = async (): Promise<string> => {
  seq += 1;
  const clinic = Clinic.create({
    name: `Clínica estado ${seq}`,
    cnpj: `${String(seq).padStart(12, '0')}${String(seq % 100).padStart(2, '0')}`,
    contactPhone: '11 3333-4444',
    contactEmail: `contato-${seq}@estado.test`,
    createdBy: 'test',
  });
  const { clinics } = await repositories(clinic.id);
  await clinics.create(clinic);
  return clinic.id;
};

const seedAccount = async (
  clinicId: string,
  role: UserRole = 'company_admin',
  opts: { password?: boolean } = {},
) => {
  seq += 1;
  const account = UserAccount.create({
    email: `conta-${seq}@${clinicId}.test`,
    passwordHash:
      opts.password === false ? UNSET_PASSWORD_HASH : 'scrypt$1$abc$def',
    role,
    clinicId,
    professionalId: null,
  });
  const { userAccounts } = await repositories(clinicId);
  await userAccounts.save(account);
  return account;
};

const versionOf = async (clinicId: string, id: string) =>
  (await (await repositories(clinicId)).userAccounts.findById(id))
    ?.sessionVersion;

const change = async (
  action: 'suspend' | 'reactivate',
  clinicId: string,
  cookie: Record<string, string> = SUPER_ADMIN,
) => {
  const route =
    action === 'suspend'
      ? await import('@/app/api/platform/clinics/[id]/suspend/route')
      : await import('@/app/api/platform/clinics/[id]/reactivate/route');
  const response = await route.POST(
    jsonRequest(
      `/api/platform/clinics/${clinicId}/${action}`,
      'POST',
      undefined,
      cookie,
    ),
    { params: Promise.resolve({ id: clinicId }) },
  );
  return {
    response,
    json: (await response.json()) as Envelope<PlatformClinicDto>,
  };
};

/** Eventos de estado da clínica-alvo (a trilha já é escopada por ela, B6). */
const statusEvents = async (clinicId: string) =>
  (await (await repositories(clinicId)).auditEvents.findAll()).filter(
    (event) =>
      event.resourceType === 'clinic-status' && event.resourceId === clinicId,
  );

describe('Feature: Suspender e reativar clínica pela plataforma (B5, Journey 7 e 8)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dada clínica ativa com contas, Quando o super_admin suspende a clínica, Então 200 suspensa, com quem e quando, e só as contas dela perdem a versão', async () => {
    const clinicId = await freshClinic();
    const otherClinicId = await freshClinic();
    const admin = await seedAccount(clinicId);
    const patient = await seedAccount(clinicId, 'patient');
    const outsider = await seedAccount(otherClinicId);
    const before = Date.now();

    const { response, json } = await change('suspend', clinicId);

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      id: clinicId,
      status: 'suspended',
      statusChangedBy: OPERATOR,
    });
    const changedAt = Date.parse(json.data.statusChangedAt as string);
    expect(changedAt).toBeGreaterThanOrEqual(before);
    expect(changedAt).toBeLessThanOrEqual(Date.now());
    expect(await versionOf(clinicId, admin.id)).toBe(1);
    expect(await versionOf(clinicId, patient.id)).toBe(1);
    expect(await versionOf(otherClinicId, outsider.id)).toBe(0);
    const { clinics } = await repositories(clinicId);
    expect((await clinics.findById(clinicId))?.status).toBe('suspended');
  });

  it('Dada clínica suspensa, Quando o super_admin reativa a clínica, Então 200 ativa, com quem e quando atualizados e versões intactas', async () => {
    const clinicId = await freshClinic();
    const admin = await seedAccount(clinicId);
    const suspended = await change('suspend', clinicId);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const { response, json } = await change(
      'reactivate',
      clinicId,
      cookieHeaderFor('super_admin', 'recuperado@vitta.app', null),
    );

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      status: 'active',
      statusChangedBy: 'recuperado@vitta.app',
    });
    expect(Date.parse(json.data.statusChangedAt as string)).toBeGreaterThan(
      Date.parse(suspended.json.data.statusChangedAt as string),
    );
    expect(await versionOf(clinicId, admin.id)).toBe(1);
  });

  it('Dada clínica já no estado pedido, Quando repetir é idempotente: 200 sem nova auditoria, sem mudar a data e sem incrementar versões', async () => {
    const clinicId = await freshClinic();
    const admin = await seedAccount(clinicId);

    const activeAgain = await change('reactivate', clinicId);
    expect(activeAgain.response.status).toBe(200);
    expect(activeAgain.json.data.status).toBe('active');
    expect(activeAgain.json.data.statusChangedAt).toBeNull();
    expect(await statusEvents(clinicId)).toHaveLength(0);

    const first = await change('suspend', clinicId);
    const second = await change('suspend', clinicId);

    expect(second.response.status).toBe(200);
    expect(second.json.data.status).toBe('suspended');
    expect(second.json.data.statusChangedAt).toBe(
      first.json.data.statusChangedAt,
    );
    expect(await statusEvents(clinicId)).toHaveLength(1);
    expect(await versionOf(clinicId, admin.id)).toBe(1);
  });

  it.each(['suspend', 'reactivate'] as const)(
    'Dada clínica inexistente, Quando %s, Então 404',
    async (action) => {
      const { response, json } = await change(action, 'nao-existe');

      expect(response.status).toBe(404);
      expect(json.error).toBe('Clínica não encontrada');
    },
  );

  it('Dadas suspensão e reativação, Quando mudar, Então a auditoria da suspensão fica na clínica-alvo com o ator super_admin', async () => {
    const clinicId = await freshClinic();

    await change('suspend', clinicId);
    await change('reactivate', clinicId);

    const events = await statusEvents(clinicId);
    expect(events).toHaveLength(2);
    for (const detail of ['suspend', 'reactivate']) {
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'update',
            resourceType: 'clinic-status',
            resourceId: clinicId,
            detail,
            actorRole: 'super_admin',
            actorId: OPERATOR,
            clinicId,
          }),
        ]),
      );
    }
  });

  it('Dada a auditoria falhou, Quando suspender ou reativar, Então 500 e estado e versões não mudam', async () => {
    const clinicId = await freshClinic();
    const admin = await seedAccount(clinicId);
    const suspendedId = await freshClinic();
    await change('suspend', suspendedId);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { DrizzleAuditEventRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository'
    );
    vi.spyOn(DrizzleAuditEventRepository.prototype, 'save').mockRejectedValue(
      new Error('trilha fora do ar'),
    );

    const suspend = await change('suspend', clinicId);
    const reactivate = await change('reactivate', suspendedId);

    expect(suspend.response.status).toBe(500);
    expect(reactivate.response.status).toBe(500);
    const { clinics } = await repositories(clinicId);
    expect((await clinics.findById(clinicId))?.status).toBe('active');
    expect((await clinics.findById(suspendedId))?.status).toBe('suspended');
    expect(await versionOf(clinicId, admin.id)).toBe(0);
  });

  it('Dada clínica suspensa, Quando ler, Então o estado na lista e no detalhe', async () => {
    const clinicId = await freshClinic();
    const activeId = await freshClinic();
    await change('suspend', clinicId);

    const list = await import('@/app/api/platform/clinics/route');
    const listed = (await (
      await list.GET(
        jsonRequest('/api/platform/clinics', 'GET', undefined, SUPER_ADMIN),
      )
    ).json()) as Envelope<PlatformClinicSummaryDto[]>;
    const statusOf = (id: string) =>
      listed.data.find((row) => row.id === id)?.status;
    expect(statusOf(clinicId)).toBe('suspended');
    expect(statusOf(activeId)).toBe('active');

    const detail = await import('@/app/api/platform/clinics/[id]/route');
    const shown = (await (
      await detail.GET(
        jsonRequest(
          `/api/platform/clinics/${clinicId}`,
          'GET',
          undefined,
          SUPER_ADMIN,
        ),
        { params: Promise.resolve({ id: clinicId }) },
      )
    ).json()) as Envelope<PlatformClinicDto>;
    expect(shown.data).toMatchObject({
      status: 'suspended',
      statusChangedBy: OPERATOR,
    });
    expect(shown.data.statusChangedAt).toEqual(expect.any(String));
  });

  it('Dada clínica suspensa na gestão de admins, Quando convidar ou reenviar, Então 400; desativar, reativar admin e editar o cadastro seguem 200', async () => {
    const clinicId = await freshClinic();
    const pending = await seedAccount(clinicId, 'company_admin', {
      password: false,
    });
    const active = await seedAccount(clinicId);
    await change('suspend', clinicId);
    const emails = spyOnSentEmails();

    const admins = await import('@/app/api/platform/clinics/[id]/admins/route');
    const invite = await admins.POST(
      jsonRequest(
        `/api/platform/clinics/${clinicId}/admins`,
        'POST',
        { email: 'novo-admin@estado.test' },
        SUPER_ADMIN,
      ),
      { params: Promise.resolve({ id: clinicId }) },
    );
    expect(invite.status).toBe(400);
    expect(((await invite.json()) as Envelope<unknown>).error).toBe(
      SUSPENDED_INVITE,
    );
    const { userAccounts } = await repositories(clinicId);
    expect(await userAccounts.findByEmail('novo-admin@estado.test')).toBeNull();

    const actions = await import(
      '@/app/api/platform/clinics/[id]/admins/[accountId]/route'
    );
    const act = async (accountId: string, action: string) =>
      actions.PATCH(
        jsonRequest(
          `/api/platform/clinics/${clinicId}/admins/${accountId}`,
          'PATCH',
          { action },
          SUPER_ADMIN,
        ),
        { params: Promise.resolve({ id: clinicId, accountId }) },
      );
    const resend = await act(pending.id, 'resend-invite');
    expect(resend.status).toBe(400);
    expect(((await resend.json()) as Envelope<unknown>).error).toBe(
      SUSPENDED_INVITE,
    );
    expect(emails.bodies).toHaveLength(0);

    expect((await act(pending.id, 'deactivate')).status).toBe(200);
    expect((await act(pending.id, 'reactivate')).status).toBe(200);
    expect(
      (await (await repositories(clinicId)).userAccounts.findById(active.id))
        ?.isActive,
    ).toBe(true);

    const detail = await import('@/app/api/platform/clinics/[id]/route');
    const edit = await detail.PATCH(
      jsonRequest(
        `/api/platform/clinics/${clinicId}`,
        'PATCH',
        { city: 'Recife' },
        SUPER_ADMIN,
      ),
      { params: Promise.resolve({ id: clinicId }) },
    );
    expect(edit.status).toBe(200);
    const edited = (await edit.json()) as Envelope<PlatformClinicDto>;
    expect(edited.data).toMatchObject({ city: 'Recife', status: 'suspended' });
  });
});
