import { describe, expect, it } from 'vitest';
import { COMMON_PASSWORDS } from '@/domain/auth/common-passwords';
import { mfaPolicy } from '@/domain/auth/mfa';
import {
  assertPasswordPolicy,
  COMMON_PASSWORD_MESSAGE,
  isCommonPassword,
  PORTAL_PASSWORD_TOO_SHORT_MESSAGE,
  passwordPolicyViolation,
  STAFF_PASSWORD_TOO_SHORT_MESSAGE,
  usesStaffPasswordPolicy,
} from '@/domain/auth/password-policy';
import { USER_ROLES } from '@/domain/auth/user-role';
import { ValidationError } from '@/domain/shared/errors';

const STAFF = ['super_admin', 'company_admin', 'atendente', 'profissional'];
const PORTAL = ['patient', 'partner'] as const;

describe('Feature: Política de senha da equipe (#291)', () => {
  describe.each(STAFF)('papel de equipe %s', (role) => {
    const check = (password: string) =>
      passwordPolicyViolation(role as (typeof USER_ROLES)[number], password);

    it('Dada senha de 9 caracteres, Então recusa pelo tamanho com a mensagem dos 10', () => {
      expect(check('xk7#pq2vz')).toBe(STAFF_PASSWORD_TOO_SHORT_MESSAGE);
      expect(STAFF_PASSWORD_TOO_SHORT_MESSAGE).toBe(
        'A senha precisa ter ao menos 10 caracteres',
      );
    });

    it('Dada senha incomum de 10 caracteres, Então aceita', () => {
      expect(check('xk7#pq2vzm')).toBeNull();
    });

    it('Dada senha da lista, Então recusa como comum, ignorando maiúsculas e espaços nas pontas', () => {
      expect(check('senha12345')).toBe(COMMON_PASSWORD_MESSAGE);
      expect(check('Senha12345')).toBe(COMMON_PASSWORD_MESSAGE);
      expect(check(' QWERTYUIOP ')).toBe(COMMON_PASSWORD_MESSAGE);
      expect(check('1234567890')).toBe(COMMON_PASSWORD_MESSAGE);
    });
  });

  describe.each(PORTAL)('portal %s (fora da política da equipe)', (role) => {
    it('Dada senha de 7 caracteres, Então recusa com o mínimo de 8', () => {
      expect(passwordPolicyViolation(role, 'xk7#pq2')).toBe(
        PORTAL_PASSWORD_TOO_SHORT_MESSAGE,
      );
    });

    it('Dada senha de 8 caracteres, mesmo comum, Então aceita como antes', () => {
      expect(passwordPolicyViolation(role, '12345678')).toBeNull();
      expect(passwordPolicyViolation(role, 'senha12345')).toBeNull();
    });
  });

  it('Dada a lista embutida, Então só tem entradas em minúsculas com 10 ou mais caracteres', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThan(100);
    for (const entry of COMMON_PASSWORDS) {
      expect(entry.length).toBeGreaterThanOrEqual(10);
      expect(entry).toBe(entry.toLowerCase());
    }
    expect(isCommonPassword('vittaflow123')).toBe(true);
    expect(isCommonPassword('xk7#pq2vzm')).toBe(false);
  });

  it('Dado o papel, Então só a equipe usa a política de 10 caracteres', () => {
    expect(USER_ROLES.filter(usesStaffPasswordPolicy)).toEqual(STAFF);
  });

  it('Dada violação, Quando assertPasswordPolicy, Então lança ValidationError com a mensagem', () => {
    expect(() => assertPasswordPolicy('company_admin', 'curta')).toThrow(
      new ValidationError(STAFF_PASSWORD_TOO_SHORT_MESSAGE),
    );
    expect(() =>
      assertPasswordPolicy('company_admin', 'xk7#pq2vzm'),
    ).not.toThrow();
  });
});

describe('Feature: Segundo fator por papel (#291)', () => {
  it('Dado cada papel, Então super_admin e company_admin exigem, atendente e profissional opcional, portais não têm', () => {
    expect(
      Object.fromEntries(USER_ROLES.map((r) => [r, mfaPolicy(r)])),
    ).toEqual({
      super_admin: 'required',
      company_admin: 'required',
      atendente: 'optional',
      profissional: 'optional',
      patient: 'none',
      partner: 'none',
    });
  });
});
