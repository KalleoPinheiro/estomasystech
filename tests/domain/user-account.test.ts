import { describe, expect, it } from 'vitest';
import {
  ANONYMIZED_ACCOUNT_REACTIVATION,
  UserAccount,
} from '@/domain/auth/user-account';
import { ConflictError, ValidationError } from '@/domain/shared/errors';

const validProps = {
  email: 'equipe@vittaflow.com',
  passwordHash: 'scrypt$16384$abc123$def456',
  role: 'company_admin' as const,
  clinicId: 'legacy-clinic',
};

describe('Feature: Conta de acesso da equipe (UserAccount)', () => {
  describe('Cenário: criar conta válida', () => {
    it('Dado dados válidos, Quando criar, Então conta ativa com id gerado', () => {
      const account = UserAccount.create(validProps);

      expect(account.id).toBeTruthy();
      expect(account.email).toBe('equipe@vittaflow.com');
      expect(account.isActive).toBe(true);
      expect(account.createdAt).toBeInstanceOf(Date);
      expect(account.professionalId).toBeNull();
      expect(account.role).toBe('company_admin');
    });

    it('Dado email com espaços e maiúsculas, Quando criar, Então email normalizado', () => {
      const account = UserAccount.create({
        ...validProps,
        email: '  Equipe@VittaFlow.com  ',
      });

      expect(account.email).toBe('equipe@vittaflow.com');
    });

    it('Dado professionalId, Quando criar, Então vincula ao profissional', () => {
      const account = UserAccount.create({
        ...validProps,
        professionalId: 'prof-1',
      });

      expect(account.professionalId).toBe('prof-1');
    });

    it('Dado professionalId null explícito, Quando criar, Então professionalId nulo', () => {
      const account = UserAccount.create({
        ...validProps,
        professionalId: null,
      });

      expect(account.professionalId).toBeNull();
    });
  });

  describe('Cenário: rejeitar dados inválidos', () => {
    it('Dado email inválido, Quando criar, Então lança ValidationError', () => {
      expect(() =>
        UserAccount.create({ ...validProps, email: 'sem-arroba' }),
      ).toThrow(ValidationError);
    });

    it('Dado hash de senha sem prefixo scrypt$, Quando criar, Então lança ValidationError', () => {
      expect(() =>
        UserAccount.create({
          ...validProps,
          passwordHash: 'plaintext-password',
        }),
      ).toThrow(ValidationError);
    });
  });

  describe('Cenário: trocar senha', () => {
    it('Dado hash válido, Quando trocar senha, Então retorna nova instância com hash atualizado', () => {
      const account = UserAccount.create(validProps);

      const updated = account.withPasswordHash('scrypt$16384$novo$hash');

      expect(updated.passwordHash).toBe('scrypt$16384$novo$hash');
      expect(account.passwordHash).toBe(validProps.passwordHash);
      expect(updated.id).toBe(account.id);
    });

    it('Dado hash inválido, Quando trocar senha, Então lança ValidationError', () => {
      const account = UserAccount.create(validProps);

      expect(() => account.withPasswordHash('md5$abc')).toThrow(
        ValidationError,
      );
    });
  });

  describe('Cenário: desativar e reativar conta', () => {
    it('Dado conta ativa, Quando desativar, Então isActive false e original preservado', () => {
      const account = UserAccount.create(validProps);

      const deactivated = account.deactivate();

      expect(deactivated.isActive).toBe(false);
      expect(account.isActive).toBe(true);
    });

    it('Dado conta inativa, Quando reativar, Então isActive true', () => {
      const account = UserAccount.create(validProps).deactivate();

      expect(account.reactivate().isActive).toBe(true);
    });

    it('Dada conta anonimizada, Quando reativar, Então recusa com erro claro (RES-07)', () => {
      const account = UserAccount.restore({
        id: 'user-anon',
        email: 'anonimizado+user-anon@anonimizado.invalid',
        passwordHash: 'scrypt$0$anonimizado$anonimizado',
        role: 'profissional',
        clinicId: 'legacy-clinic',
        active: false,
        createdAt: new Date('2020-01-01T00:00:00Z'),
        anonymizedAt: new Date('2026-10-12T00:00:00Z'),
      });

      expect(account.isAnonymized).toBe(true);
      expect(() => account.reactivate()).toThrow(
        ANONYMIZED_ACCOUNT_REACTIVATION,
      );
      expect(() => account.reactivate()).toThrow(ConflictError);
    });

    it('Dada conta comum, Então não consta como anonimizada', () => {
      expect(UserAccount.create(validProps).isAnonymized).toBe(false);
    });
  });

  describe('Cenário: reconstituir conta da persistência', () => {
    it('Dado state completo, Quando restore, Então mantém todos os campos', () => {
      const createdAt = new Date('2026-01-01T12:00:00Z');
      const account = UserAccount.restore({
        id: 'user-1',
        email: 'user@x.com',
        passwordHash: 'scrypt$16384$s$h',
        role: 'profissional',
        clinicId: 'legacy-clinic',
        professionalId: 'prof-9',
        active: false,
        createdAt,
      });

      expect(account.id).toBe('user-1');
      expect(account.professionalId).toBe('prof-9');
      expect(account.role).toBe('profissional');
      expect(account.clinicId).toBe('legacy-clinic');
      expect(account.isActive).toBe(false);
      expect(account.createdAt).toEqual(createdAt);
    });
  });
});
