import { describe, expect, it } from 'vitest';
import {
  accountChangeDetail,
  assertCanDeactivate,
  assertCanManageAccount,
  visibleAccounts,
} from '@/domain/auth/account-management';
import { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import {
  ProvisioningDeniedError,
  ValidationError,
} from '@/domain/shared/errors';

const HASH = 'scrypt$unset';

const account = (role: UserRole, email = `${role}@x.com`) =>
  UserAccount.create({ email, passwordHash: HASH, role, clinicId: 'c1' });

describe('Feature: regra de gestão de contas existentes (#184)', () => {
  describe('assertCanManageAccount', () => {
    it.each([
      ['atendente', 'company_admin'],
      ['profissional', 'company_admin'],
      ['atendente', 'atendente'],
      ['profissional', 'profissional'],
      ['company_admin', 'super_admin'],
    ] as const)(
      'Dado %s, Quando gerir conta %s, Então nega (403)',
      (actorRole, targetRole) => {
        expect(() =>
          assertCanManageAccount(
            { role: actorRole, subject: 'ator@x.com' },
            account(targetRole),
          ),
        ).toThrow(ProvisioningDeniedError);
      },
    );

    it.each([
      ['company_admin', 'atendente'],
      ['company_admin', 'company_admin'],
      ['atendente', 'patient'],
      ['profissional', 'partner'],
      ['super_admin', 'company_admin'],
    ] as const)(
      'Dado %s, Quando gerir conta %s, Então permite',
      (actorRole, targetRole) => {
        expect(() =>
          assertCanManageAccount(
            { role: actorRole, subject: 'ator@x.com' },
            account(targetRole),
          ),
        ).not.toThrow();
      },
    );
  });

  describe('assertCanDeactivate', () => {
    it('Dada a própria conta, Quando desativar, Então nega com mensagem clara', () => {
      const self = account('company_admin', 'eu@x.com');
      const other = account('company_admin', 'outro@x.com');
      expect(() =>
        assertCanDeactivate(
          { role: 'company_admin', subject: 'eu@x.com' },
          self,
          [self, other],
        ),
      ).toThrow(
        new ValidationError('Não é possível desativar a própria conta'),
      );
    });

    it('Dado o último company_admin ativo, Quando desativar, Então nega com mensagem clara', () => {
      const admin = account('company_admin', 'unico@x.com');
      const inactiveAdmin = account(
        'company_admin',
        'inativo@x.com',
      ).deactivate();
      expect(() =>
        assertCanDeactivate(
          { role: 'super_admin', subject: 'root@x.com' },
          admin,
          [admin, inactiveAdmin, account('atendente')],
        ),
      ).toThrow(
        new ValidationError(
          'Não é possível desativar o último administrador ativo da empresa',
        ),
      );
    });

    it('Dado outro company_admin ativo, Quando desativar um admin, Então permite', () => {
      const admin = account('company_admin', 'a1@x.com');
      const other = account('company_admin', 'a2@x.com');
      expect(() =>
        assertCanDeactivate(
          { role: 'company_admin', subject: 'a2@x.com' },
          admin,
          [admin, other],
        ),
      ).not.toThrow();
    });

    it('Dado alvo não-admin, Quando desativar, Então permite sem contar admins', () => {
      const target = account('patient');
      expect(() =>
        assertCanDeactivate(
          { role: 'atendente', subject: 'at@x.com' },
          target,
          [target],
        ),
      ).not.toThrow();
    });

    it('Dado admin já inativo, Quando desativar de novo, Então permite (não reduz admins ativos)', () => {
      const admin = account('company_admin', 'x@x.com').deactivate();
      expect(() =>
        assertCanDeactivate({ role: 'super_admin', subject: null }, admin, [
          admin,
        ]),
      ).not.toThrow();
    });
  });

  describe('visibleAccounts', () => {
    const all = [
      account('super_admin'),
      account('company_admin'),
      account('atendente'),
      account('profissional'),
      account('patient'),
      account('partner'),
    ];
    const roles = (list: UserAccount[]) => list.map((a) => a.role);

    it('Dado atendente ou profissional, Então só patient e partner', () => {
      expect(roles(visibleAccounts('atendente', all))).toEqual([
        'patient',
        'partner',
      ]);
      expect(roles(visibleAccounts('profissional', all))).toEqual([
        'patient',
        'partner',
      ]);
    });

    it('Dado company_admin, Então tudo menos super_admin', () => {
      expect(roles(visibleAccounts('company_admin', all))).toEqual([
        'company_admin',
        'atendente',
        'profissional',
        'patient',
        'partner',
      ]);
    });
  });

  describe('accountChangeDetail', () => {
    it('Dado cada combinação, Então descreve a alteração para a auditoria', () => {
      expect(accountChangeDetail({ password: 'x' })).toBe('password');
      expect(accountChangeDetail({ active: false })).toBe('deactivate');
      expect(accountChangeDetail({ active: true })).toBe('reactivate');
      expect(accountChangeDetail({ password: 'x', active: false })).toBe(
        'password, deactivate',
      );
      expect(accountChangeDetail({})).toBeNull();
    });
  });
});
