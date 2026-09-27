import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
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

interface ActionDto {
  id: string;
  email: string;
  active: boolean;
  passwordSet: boolean;
  delivered: boolean | null;
}

const SUPER_ADMIN = cookieHeaderFor('super_admin', 'dono@vitta.app', null);

const repositories = async (clinicId: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  return getRepositories(clinicScope(clinicId));
};

let seq = 0;
const seedAccount = async (
  clinicId: string,
  opts: { role?: UserRole; password?: boolean; active?: boolean } = {},
) => {
  const account = UserAccount.create({
    email: `conta-${++seq}@${clinicId}.test`,
    passwordHash:
      opts.password === false ? UNSET_PASSWORD_HASH : 'scrypt$1$abc$def',
    role: opts.role ?? 'company_admin',
    clinicId,
    professionalId: null,
  });
  const stored = opts.active === false ? account.deactivate() : account;
  const { userAccounts } = await repositories(clinicId);
  await userAccounts.save(stored);
  return stored;
};

const stored = async (clinicId: string, id: string) => {
  const { userAccounts } = await repositories(clinicId);
  return userAccounts.findById(id);
};

const act = async (clinicId: string, accountId: string, body: unknown) => {
  const route = await import(
    '@/app/api/platform/clinics/[id]/admins/[accountId]/route'
  );
  const response = await route.PATCH(
    jsonRequest(
      `/api/platform/clinics/${clinicId}/admins/${accountId}`,
      'PATCH',
      body,
      SUPER_ADMIN,
    ),
    { params: Promise.resolve({ id: clinicId, accountId }) },
  );
  return { response, json: (await response.json()) as Envelope<ActionDto> };
};

/** Clínica nova, sem admin nenhum — isola a regra do "último ativo". */
const freshClinic = async () => {
  await ensureTestClinics();
  const { Clinic } = await import('@/domain/clinic/clinic');
  const clinic = Clinic.restore({
    id: `acoes-${++seq}`,
    name: 'Clínica das ações',
    createdBy: 'test',
    createdAt: new Date(),
  });
  const { clinics } = await repositories(clinic.id);
  await clinics.create(clinic);
  return clinic.id;
};

describe('Feature: Gestão de admins pela plataforma (B4, Journey 4 e 5)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado admin pendente, Quando o super_admin reenvia o convite, Então novo e-mail sem link na resposta; desativado recebe 400', async () => {
    const clinicId = await freshClinic();
    const pending = await seedAccount(clinicId, { password: false });
    const inactive = await seedAccount(clinicId, { active: false });
    const emails = spyOnSentEmails();

    const { response, json } = await act(clinicId, pending.id, {
      action: 'resend-invite',
    });

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      id: pending.id,
      email: pending.email,
      active: true,
      passwordSet: false,
      delivered: expect.any(Boolean),
    });
    expect(JSON.stringify(json)).not.toMatch(/token|definir-senha|https?:/);
    expect(emails.bodies).toHaveLength(1);
    expect(emails.bodies[0]).toContain(pending.email);
    expect(emails.bodies[0]).toMatch(/definir-senha\?token=/);

    const refused = await act(clinicId, inactive.id, {
      action: 'resend-invite',
    });
    expect(refused.response.status).toBe(400);
    expect(refused.json.error).toBe(
      'Conta desativada não pode receber convite',
    );
    expect(emails.bodies).toHaveLength(1);
  });

  it('Dado outro admin ativo, Quando desativa o admin, Então 200, conta inativa e sessões revogadas', async () => {
    const clinicId = await freshClinic();
    const leaving = await seedAccount(clinicId);
    await seedAccount(clinicId, { password: false });
    const versionBefore = leaving.sessionVersion;

    const { response, json } = await act(clinicId, leaving.id, {
      action: 'deactivate',
    });

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      id: leaving.id,
      active: false,
      delivered: null,
    });
    const after = await stored(clinicId, leaving.id);
    expect(after?.isActive).toBe(false);
    expect(after?.sessionVersion).toBe(versionBefore + 1);
  });

  it('Dado o último admin ativo, Quando desativar, Então último admin ativo responde 400 e nada muda', async () => {
    const clinicId = await freshClinic();
    const only = await seedAccount(clinicId);
    await seedAccount(clinicId, { active: false });

    const { response, json } = await act(clinicId, only.id, {
      action: 'deactivate',
    });

    expect(response.status).toBe(400);
    expect(json.error).toBe(
      'Não é possível desativar o último administrador ativo da empresa',
    );
    expect((await stored(clinicId, only.id))?.isActive).toBe(true);
  });

  it('Dado admin desativado, Quando reativa o admin, Então 200 e conta ativa', async () => {
    const clinicId = await freshClinic();
    const inactive = await seedAccount(clinicId, { active: false });

    const { response, json } = await act(clinicId, inactive.id, {
      action: 'reactivate',
    });

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ active: true, delivered: null });
    expect((await stored(clinicId, inactive.id))?.isActive).toBe(true);
  });

  it('Dada conta que não é admin daquela clínica, Quando agir, Então só admin da clínica é alvo (404) e nada muda', async () => {
    await ensureTestClinics();
    const attendant = await seedAccount(CLINIC_B_ID, { role: 'atendente' });
    const otherClinicAdmin = await seedAccount(CLINIC_A_ID, { active: false });
    const cases = [
      [attendant.id, 'Admin não encontrado'],
      [otherClinicAdmin.id, 'Admin não encontrado'],
      ['conta-inexistente', 'Admin não encontrado'],
    ] as const;

    for (const [accountId, message] of cases) {
      const { response, json } = await act(CLINIC_B_ID, accountId, {
        action: 'deactivate',
      });
      expect(response.status).toBe(404);
      expect(json.error).toBe(message);
    }
    const reactivated = await act(CLINIC_B_ID, otherClinicAdmin.id, {
      action: 'reactivate',
    });
    expect(reactivated.response.status).toBe(404);
    expect((await stored(CLINIC_B_ID, attendant.id))?.isActive).toBe(true);
    expect((await stored(CLINIC_A_ID, otherClinicAdmin.id))?.isActive).toBe(
      false,
    );

    const noClinic = await act('nao-existe', attendant.id, {
      action: 'reactivate',
    });
    expect(noClinic.response.status).toBe(404);
    expect(noClinic.json.error).toBe('Clínica não encontrada');
  });

  it.each([
    ['ação desconhecida', { action: 'promote' }],
    ['sem ação', {}],
  ])(
    'Dado %s, Quando agir, Então ação inválida responde 400',
    async (_label, body) => {
      const clinicId = await freshClinic();
      const admin = await seedAccount(clinicId);

      const { response } = await act(clinicId, admin.id, body);

      expect(response.status).toBe(400);
      expect((await stored(clinicId, admin.id))?.isActive).toBe(true);
    },
  );

  it.each([
    ['resend-invite', { password: false }],
    ['deactivate', {}],
    ['reactivate', { active: false }],
  ] as const)(
    'Dada a ação %s, Quando agir, Então grava a auditoria das ações na clínica-alvo antes de mudar',
    async (action, opts) => {
      const clinicId = await freshClinic();
      const target = await seedAccount(clinicId, opts);
      await seedAccount(clinicId);
      spyOnSentEmails();

      const { response } = await act(clinicId, target.id, { action });

      expect(response.status).toBe(200);
      const { auditEvents } = await repositories(clinicId);
      expect(await auditEvents.findAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'update',
            resourceType: 'account',
            resourceId: target.id,
            detail: action,
            actorRole: 'super_admin',
            actorId: 'dono@vitta.app',
            clinicId,
          }),
        ]),
      );
    },
  );

  it('Dada a auditoria falhou, Quando desativar ou reenviar, Então a conta não muda e nenhum e-mail sai', async () => {
    const clinicId = await freshClinic();
    const leaving = await seedAccount(clinicId, { password: false });
    await seedAccount(clinicId);
    const emails = spyOnSentEmails();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { DrizzleAuditEventRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository'
    );
    vi.spyOn(DrizzleAuditEventRepository.prototype, 'save').mockRejectedValue(
      new Error('trilha fora do ar'),
    );

    const deactivate = await act(clinicId, leaving.id, {
      action: 'deactivate',
    });
    const resend = await act(clinicId, leaving.id, {
      action: 'resend-invite',
    });

    expect(deactivate.response.status).toBe(500);
    expect(resend.response.status).toBe(500);
    const after = await stored(clinicId, leaving.id);
    expect(after?.isActive).toBe(true);
    expect(after?.sessionVersion).toBe(leaving.sessionVersion);
    expect(emails.bodies).toHaveLength(0);
  });
});
