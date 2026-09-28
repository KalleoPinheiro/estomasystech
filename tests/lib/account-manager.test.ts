import { describe, expect, it } from 'vitest';
import { accountManager } from '@/lib/auth/account-manager';
import type { Session } from '@/lib/auth/session';

const session = (role: Session['role'], subject: string): Session => ({
  expiresAtMs: Date.now() + 60_000,
  subject,
  role,
  clinicId: 'c1',
  professionalId: null,
});

describe('Feature: ator das rotas de gestão de conta (#253)', () => {
  describe('Cenário: modo aberto (sem sessão)', () => {
    it('Dado session null, Quando resolver o ator, Então age como company_admin, igual ao POST /api/accounts', () => {
      expect(accountManager(null)).toEqual({
        role: 'company_admin',
        subject: null,
      });
    });
  });

  describe('Cenário: sessão real', () => {
    it('Dado uma sessão, Quando resolver o ator, Então usa o papel e o subject da própria sessão', () => {
      expect(accountManager(session('atendente', 'atendente@x.com'))).toEqual({
        role: 'atendente',
        subject: 'atendente@x.com',
      });
    });
  });
});
