import { describe, expect, it } from 'vitest';
import {
  INCOMPLETE_REGISTRATION_MESSAGE,
  ManageClinicAdmins,
  type ManageClinicAdminsServices,
  SUSPENDED_CLINIC_INVITE_MESSAGE,
} from '@/application/platform/manage-clinic-admins';
import type {
  EmailGateway,
  EmailMessage,
} from '@/application/ports/email-gateway';
import { NoTransactionManager } from '@/application/ports/transaction-manager';
import {
  DEACTIVATED_ACCOUNT_MESSAGE,
  LAST_ADMIN_MESSAGE,
} from '@/domain/auth/account-management';
import type { AuthToken, AuthTokenRepository } from '@/domain/auth/auth-token';
import type { MfaFactor, MfaRepository } from '@/domain/auth/mfa';
import { Clinic } from '@/domain/clinic/clinic';
import { ConflictError } from '@/domain/shared/errors';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import { InMemoryUserAccountRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { buildUserAccount } from '../../support/builders';
import { inMemoryScope } from '../../support/transaction-scope';

class Tokens implements AuthTokenRepository {
  readonly saved: AuthToken[] = [];
  async save(token: AuthToken) {
    this.saved.push(token);
  }
  async replaceUnused(token: AuthToken) {
    this.saved.push(token);
  }
  async claimBySecretHash() {
    return null;
  }
  async findUsableBySecretHash() {
    return null;
  }
  async markAllUnusedAsUsed() {}
}

class Email implements EmailGateway {
  readonly sent: EmailMessage[] = [];
  constructor(private readonly enabled: boolean) {}
  async isEnabled() {
    return this.enabled;
  }
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

const CLINIC_ID = 'clinica-mutacao';

function setup(opts: { emailEnabled?: boolean; hasFactor?: boolean } = {}) {
  const userAccounts = new InMemoryUserAccountRepository();
  const auditEvents = new InMemoryAuditEventRepository();
  const email = new Email(opts.emailEnabled ?? false);
  const tokens = new Tokens();
  const removed: string[] = [];
  const mfa = {
    findFactor: async () => (opts.hasFactor ? ({} as MfaFactor) : null),
    removeFactor: async (id: string) => {
      removed.push(id);
    },
  } as unknown as MfaRepository;
  const services: ManageClinicAdminsServices = {
    userAccounts,
    auditEvents,
    authTokens: tokens,
    email,
    mfa,
    transactions: new NoTransactionManager(
      inMemoryScope({ userAccounts, auditEvents }),
    ),
  };
  return {
    manage: new ManageClinicAdmins(services),
    userAccounts,
    tokens,
    email,
    removed,
  };
}

const completeClinic = () =>
  Clinic.create({
    name: 'Clínica Mutação',
    cnpj: '11222333000181',
    contactPhone: '+5511999990000',
    contactEmail: 'contato@clinica.test',
    createdBy: 'super@estomasystech.test',
  });

const suspendedClinic = () =>
  completeClinic().suspend('super@estomasystech.test', new Date(), {
    reason: 'non_payment',
  });

const admin = (overrides = {}) =>
  buildUserAccount({
    role: 'company_admin',
    clinicId: CLINIC_ID,
    ...overrides,
  });

describe('Feature: Gestão dos admins de uma clínica pela plataforma (mutação, #406)', () => {
  describe('Cenário: listar e localizar', () => {
    it('Dado contas de vários papéis, Quando listo, Então só vêm os company_admin', async () => {
      const { manage, userAccounts } = setup();
      const a = admin();
      await userAccounts.save(a);
      await userAccounts.save(
        buildUserAccount({ role: 'profissional', clinicId: CLINIC_ID }),
      );
      expect((await manage.list()).map((x) => x.id)).toEqual([a.id]);
    });

    it('Dado uma conta que não é admin, Quando localizo, Então devolve null', async () => {
      const { manage, userAccounts } = setup();
      const pro = buildUserAccount({
        role: 'profissional',
        clinicId: CLINIC_ID,
      });
      const a = admin();
      await userAccounts.save(pro);
      await userAccounts.save(a);
      expect(await manage.find(pro.id)).toBeNull();
      expect((await manage.find(a.id))?.id).toBe(a.id);
      expect(await manage.find('inexistente')).toBeNull();
    });
  });

  describe('Cenário: convite', () => {
    it('Dado clínica suspensa, Quando convido, Então recusa pelo motivo da suspensão', async () => {
      const { manage } = setup();
      await expect(
        manage.invite(suspendedClinic(), 'novo@clinica.test', async () => {}),
      ).rejects.toThrow(SUSPENDED_CLINIC_INVITE_MESSAGE);
    });

    it('Dado clínica sem cadastro completo, Quando convido, Então recusa', async () => {
      const { manage } = setup();
      const incomplete = Clinic.restore({
        id: 'legacy',
        name: 'Legada',
        createdBy: 'x',
        createdAt: new Date(),
        status: 'active',
      } as never);
      await expect(
        manage.invite(incomplete, 'novo@clinica.test', async () => {}),
      ).rejects.toThrow(INCOMPLETE_REGISTRATION_MESSAGE);
    });

    it('Dado clínica ativa e completa, Quando convido, Então cria o company_admin sem senha, audita e devolve o link sem e-mail', async () => {
      const { manage, userAccounts } = setup({ emailEnabled: false });
      const clinic = completeClinic();
      const audited: string[] = [];
      const result = await manage.invite(
        clinic,
        'novo@clinica.test',
        async (_a, created) => {
          audited.push(created.email);
        },
      );
      expect(result.account.role).toBe('company_admin');
      expect(result.account.clinicId).toBe(clinic.id);
      expect(result.account.passwordHash).toBe(UNSET_PASSWORD_HASH);
      expect(audited).toEqual(['novo@clinica.test']);
      expect(result.delivered).toBe(false);
      expect(result.inviteUrl).toMatch(/^http/);
      expect((await userAccounts.findByEmail('novo@clinica.test'))?.id).toBe(
        result.account.id,
      );
    });

    it('Dado e-mail duplicado na mesma clínica, Quando convido, Então recusa com mensagem de duplicidade', async () => {
      const { manage } = setup();
      const clinic = completeClinic();
      await manage.invite(clinic, 'dup@clinica.test', async () => {});
      await expect(
        manage.invite(clinic, 'dup@clinica.test', async () => {}),
      ).rejects.toThrow(/Já existe|e-mail|email/i);
    });

    it('Dado canal de e-mail ligado, Quando convido, Então o link sai por e-mail e não volta', async () => {
      const { manage, email } = setup({ emailEnabled: true });
      const result = await manage.invite(
        completeClinic(),
        'ok@clinica.test',
        async () => {},
      );
      expect(result.delivered).toBe(true);
      expect(result.inviteUrl).toBeNull();
      expect(email.sent).toHaveLength(1);
    });
  });

  describe('Cenário: ações sobre um admin', () => {
    it.each(['resend-invite', 'reset-link'] as const)(
      'Dado clínica suspensa, Quando %s, Então recusa',
      async (action) => {
        const { manage } = setup();
        await expect(
          manage.apply(suspendedClinic(), admin(), action, async () => {}),
        ).rejects.toThrow(SUSPENDED_CLINIC_INVITE_MESSAGE);
      },
    );

    it('Dado admin desativado, Quando reenvio o convite, Então recusa sem auditar', async () => {
      const { manage } = setup();
      let audits = 0;
      await expect(
        manage.apply(
          completeClinic(),
          admin().deactivate(),
          'resend-invite',
          async () => {
            audits += 1;
          },
        ),
      ).rejects.toThrow('Conta desativada não pode receber convite');
      expect(audits).toBe(0);
    });

    it('Dado admin com senha ainda não definida, Quando reenvio, Então emite convite; com senha, emite reset', async () => {
      const { manage, tokens } = setup();
      const pending = admin({ passwordHash: UNSET_PASSWORD_HASH });
      await manage.apply(
        completeClinic(),
        pending,
        'resend-invite',
        async () => {},
      );
      const withPassword = admin({ passwordHash: 'scrypt$1$salt$hash' });
      await manage.apply(
        completeClinic(),
        withPassword,
        'resend-invite',
        async () => {},
      );
      expect(tokens.saved.map((t) => t.purpose)).toEqual(['invite', 'reset']);
    });

    it('Dado admin ativo, Quando gero link de redefinição, Então audita e emite token reset', async () => {
      const { manage, tokens } = setup();
      let audits = 0;
      const result = await manage.apply(
        completeClinic(),
        admin(),
        'reset-link',
        async () => {
          audits += 1;
        },
      );
      expect(audits).toBe(1);
      expect(tokens.saved.map((t) => t.purpose)).toEqual(['reset']);
      expect(result.delivered).toBe(false);
      expect(result.inviteUrl).toMatch(/^http/);
    });

    it('Dado admin desativado, Quando gero link de redefinição, Então recusa com conflito', async () => {
      const { manage } = setup();
      await expect(
        manage.apply(
          completeClinic(),
          admin().deactivate(),
          'reset-link',
          async () => {},
        ),
      ).rejects.toThrow(DEACTIVATED_ACCOUNT_MESSAGE);
      await expect(
        manage.apply(
          completeClinic(),
          admin().deactivate(),
          'reset-link',
          async () => {},
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('Dado dois admins ativos, Quando desativo um, Então grava inativo, audita e derruba as sessões', async () => {
      const { manage, userAccounts } = setup();
      const a = admin();
      const b = admin();
      await userAccounts.save(a);
      await userAccounts.save(b);
      let audits = 0;
      const result = await manage.apply(
        completeClinic(),
        a,
        'deactivate',
        async () => {
          audits += 1;
        },
      );
      expect(audits).toBe(1);
      expect(result).toMatchObject({ delivered: null, inviteUrl: null });
      const stored = await userAccounts.findById(a.id);
      expect(stored?.isActive).toBe(false);
      expect(stored?.sessionVersion).toBe(a.sessionVersion + 1);
    });

    it('Dado o único admin ativo, Quando desativo, Então recusa e não grava', async () => {
      const { manage, userAccounts } = setup();
      const only = admin();
      await userAccounts.save(only);
      await expect(
        manage.apply(completeClinic(), only, 'deactivate', async () => {}),
      ).rejects.toThrow(LAST_ADMIN_MESSAGE);
      expect((await userAccounts.findById(only.id))?.isActive).toBe(true);
    });

    it('Dado admin desativado, Quando reativo, Então audita e volta a ativo', async () => {
      const { manage, userAccounts } = setup();
      const off = admin().deactivate();
      await userAccounts.save(off);
      let audits = 0;
      const result = await manage.apply(
        completeClinic(),
        off,
        'reactivate',
        async () => {
          audits += 1;
        },
      );
      expect(audits).toBe(1);
      expect(result.account.isActive).toBe(true);
      expect(result).toMatchObject({ delivered: null, inviteUrl: null });
      expect((await userAccounts.findById(off.id))?.isActive).toBe(true);
    });

    it('Dado admin com segundo fator, Quando reseto o MFA, Então audita, derruba sessões e remove o fator', async () => {
      const { manage, userAccounts, removed } = setup({ hasFactor: true });
      const a = admin();
      await userAccounts.save(a);
      let audits = 0;
      const result = await manage.apply(
        completeClinic(),
        a,
        'reset-mfa',
        async () => {
          audits += 1;
        },
      );
      expect(audits).toBe(1);
      expect(removed).toEqual([a.id]);
      expect(result).toEqual({ account: a, delivered: null, inviteUrl: null });
      expect((await userAccounts.findById(a.id))?.sessionVersion).toBe(
        a.sessionVersion + 1,
      );
    });

    it('Dado admin sem segundo fator, Quando reseto o MFA, Então recusa com conflito', async () => {
      const { manage } = setup({ hasFactor: false });
      await expect(
        manage.apply(completeClinic(), admin(), 'reset-mfa', async () => {}),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});
