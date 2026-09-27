import { describe, expect, it } from 'vitest';
import { adminStatusOf } from '@/application/platform/clinic-overview';
import { UserAccount } from '@/domain/auth/user-account';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';

const admin = (state: { password: boolean; active: boolean }) => {
  const account = UserAccount.create({
    email: `admin-${Math.random()}@x.com`,
    passwordHash: state.password ? 'scrypt$1$abc$def' : UNSET_PASSWORD_HASH,
    role: 'company_admin',
    clinicId: 'c1',
    professionalId: null,
  });
  return state.active ? account : account.deactivate();
};

describe('Feature: Estado do admin na lista da plataforma (B4)', () => {
  it.each([
    ['nenhum admin', 'none', []],
    ['só admin desativado', 'none', [admin({ password: true, active: false })]],
    [
      'admin ativo só com convite',
      'pending',
      [admin({ password: false, active: true })],
    ],
    [
      'admin desativado com senha e outro pendente',
      'pending',
      [
        admin({ password: true, active: false }),
        admin({ password: false, active: true }),
      ],
    ],
    [
      'admin ativo com senha',
      'active',
      [
        admin({ password: false, active: true }),
        admin({ password: true, active: true }),
      ],
    ],
  ] as const)(
    'Dado %s, Quando derivar o estado do admin, Então %s',
    (_label, expected, accounts) => {
      expect(adminStatusOf(accounts)).toBe(expected);
    },
  );
});
