import { describe, expect, it } from 'vitest';
import type {
  BillingRef,
  CommissionRule,
  ProducedSession,
} from '@/domain/billing/commission';
import {
  buildStatement,
  CommissionPayout,
  isPeriodEnded,
  type PaidItemRef,
  periodBounds,
} from '@/domain/billing/commission-payout';
import { Professional } from '@/domain/professional/professional';
import { ValidationError } from '@/domain/shared/errors';

const NOW = new Date('2026-10-15T12:00:00');
const paid: BillingRef = {
  status: 'paid',
  issuedAt: new Date('2026-09-01'),
  dueDate: null,
};
const pending: BillingRef = {
  status: 'pending',
  issuedAt: new Date('2026-10-10'),
  dueDate: null,
};
const cancelled: BillingRef = { ...paid, status: 'cancelled' };

const session = (
  id: string,
  invoice: BillingRef | null,
  overrides: Partial<ProducedSession> = {},
): ProducedSession => ({
  appointmentId: id,
  professionalId: 'prof-1',
  procedure: 'Curativo',
  sessionDate: new Date('2026-09-10T12:00:00'),
  listPriceCents: 15000,
  invoice,
  package: null,
  ...overrides,
});

const PCT_40: CommissionRule = { kind: 'percentage', pct: 40 };
const FIXED_50: CommissionRule = { kind: 'fixed', centsPerSession: 5000 };

const paidRef = (
  appointmentId: string,
  commissionCents: number,
  kind: PaidItemRef['kind'] = 'session',
): PaidItemRef => ({
  professionalId: 'prof-1',
  appointmentId,
  kind,
  commissionCents,
});

describe('Feature: Livro de repasses (domínio)', () => {
  describe('Extrato (buildStatement)', () => {
    it('Dadas sessões liberada e pendente, Então só a liberada entra no pagamento', () => {
      const statement = buildStatement(
        [session('a', paid), session('b', pending)],
        [],
        PCT_40,
        NOW,
      );

      expect(statement.payable.map((i) => i.appointmentId)).toEqual(['a']);
      expect(statement.payableCents).toBe(6000);
      expect(statement.pending.map((i) => i.appointmentId)).toEqual(['b']);
      expect(statement.pendingCents).toBe(6000);
    });

    it('Dada sessão já paga, Então não entra de novo (nunca paga duas vezes)', () => {
      const statement = buildStatement(
        [session('a', paid), session('b', paid)],
        [paidRef('a', 6000)],
        PCT_40,
        NOW,
      );

      expect(statement.payable.map((i) => i.appointmentId)).toEqual(['b']);
    });

    it('Dada sessão paga cuja fatura foi cancelada depois, Então gera estorno negativo uma única vez', () => {
      const first = buildStatement(
        [session('a', cancelled)],
        [paidRef('a', 6000)],
        PCT_40,
        NOW,
      );
      expect(first.payable).toEqual([
        expect.objectContaining({
          appointmentId: 'a',
          kind: 'reversal',
          commissionCents: -6000,
        }),
      ]);

      const afterReversal = buildStatement(
        [session('a', cancelled)],
        [paidRef('a', 6000), paidRef('a', -6000, 'reversal')],
        PCT_40,
        NOW,
      );
      expect(afterReversal.payable).toEqual([]);
    });

    it('Dada sessão com fatura cancelada nunca paga, Então fica fora do extrato', () => {
      const statement = buildStatement(
        [session('a', cancelled)],
        [],
        PCT_40,
        NOW,
      );
      expect(statement.payable).toEqual([]);
      expect(statement.pending).toEqual([]);
    });

    it('Dada regra de valor fixo, Então cada sessão liberada vale o valor fixo', () => {
      const statement = buildStatement(
        [session('a', paid), session('b', paid, { listPriceCents: 99000 })],
        [],
        FIXED_50,
        NOW,
      );
      expect(statement.payableCents).toBe(10000);
    });

    it('Dada regra de 0%, Então sessão liberada sem valor não entra no pagamento', () => {
      const statement = buildStatement(
        [session('a', paid)],
        [],
        { kind: 'percentage', pct: 0 },
        NOW,
      );
      expect(statement.payable).toEqual([]);
    });

    it('Dadas sessões fora de ordem, Então o extrato sai em ordem cronológica', () => {
      const statement = buildStatement(
        [
          session('late', paid, {
            sessionDate: new Date('2026-09-20T12:00:00'),
          }),
          session('early', paid, {
            sessionDate: new Date('2026-09-02T12:00:00'),
          }),
        ],
        [],
        PCT_40,
        NOW,
      );
      expect(statement.payable.map((i) => i.appointmentId)).toEqual([
        'early',
        'late',
      ]);
    });
  });

  describe('Período', () => {
    it('Dado AAAA-MM, Então limites do mês no fuso local', () => {
      expect(periodBounds('2026-09')).toEqual({
        start: new Date(2026, 8, 1),
        end: new Date(2026, 9, 1),
      });
      expect(() => periodBounds('2026-13')).toThrow(ValidationError);
    });

    it('Dado o mês corrente ou futuro, Então ainda não pode ser fechado', () => {
      expect(isPeriodEnded('2026-09', NOW)).toBe(true);
      expect(isPeriodEnded('2026-10', NOW)).toBe(false);
      expect(isPeriodEnded('2026-11', NOW)).toBe(false);
    });
  });

  describe('Repasse (CommissionPayout)', () => {
    const base = {
      professionalId: 'prof-1',
      period: '2026-09',
      paidAt: NOW,
      paymentMethod: 'pix' as const,
      createdBy: 'admin@clinica.com',
    };
    const item = (commissionCents: number) => ({
      appointmentId: `a-${commissionCents}`,
      kind: 'session' as const,
      procedure: 'Curativo',
      sessionDate: NOW,
      baseCents: 15000,
      commissionCents,
    });

    it('Dados itens, Então o total é a soma e as observações vazias viram null', () => {
      const payout = CommissionPayout.create({
        ...base,
        notes: '   ',
        items: [item(6000), item(4000)],
      });
      expect(payout.totalCents).toBe(10000);
      expect(payout.notes).toBeNull();
    });

    it('Sem itens, com saldo zero/negativo, forma inválida ou mês inválido, Então recusa', () => {
      expect(() => CommissionPayout.create({ ...base, items: [] })).toThrow(
        ValidationError,
      );
      expect(() =>
        CommissionPayout.create({ ...base, items: [item(-500)] }),
      ).toThrow(/zero ou negativo/);
      expect(() =>
        CommissionPayout.create({
          ...base,
          paymentMethod: 'boleto' as never,
          items: [item(100)],
        }),
      ).toThrow(ValidationError);
      expect(() =>
        CommissionPayout.create({
          ...base,
          period: 'setembro',
          items: [item(100)],
        }),
      ).toThrow(ValidationError);
    });
  });

  describe('Regra de repasse do profissional', () => {
    it('Dado percentual, Então a regra é percentual', () => {
      const professional = Professional.create({
        fullName: 'Ana',
        commissionPct: 40,
      });
      expect(professional.commissionRule).toEqual({
        kind: 'percentage',
        pct: 40,
      });
    });

    it('Dado valor fixo, Então a regra é fixa; sem valor, recusa', () => {
      const professional = Professional.create({
        fullName: 'Caio',
        commissionType: 'fixed',
        commissionFixedCents: 5000,
      });
      expect(professional.commissionRule).toEqual({
        kind: 'fixed',
        centsPerSession: 5000,
      });
      expect(() =>
        Professional.create({ fullName: 'Caio', commissionType: 'fixed' }),
      ).toThrow(ValidationError);
    });

    it('Dados valores inválidos, Então recusa', () => {
      expect(() =>
        Professional.create({
          fullName: 'Caio',
          commissionType: 'fixed',
          commissionFixedCents: -1,
        }),
      ).toThrow(ValidationError);
      expect(() =>
        Professional.create({
          fullName: 'Caio',
          commissionType: 'bonus' as never,
        }),
      ).toThrow(ValidationError);
    });

    it('Dado profissional sem regra, Então commissionRule é null', () => {
      expect(
        Professional.create({ fullName: 'Sem regra' }).commissionRule,
      ).toBeNull();
    });

    it('Dada troca de percentual para fixo, Quando atualizar, Então mantém os demais campos', () => {
      const updated = Professional.create({
        fullName: 'Ana',
        registry: 'COREN 1',
        commissionPct: 40,
      }).update({ commissionType: 'fixed', commissionFixedCents: 3000 });

      expect(updated.registry).toBe('COREN 1');
      expect(updated.commissionRule).toEqual({
        kind: 'fixed',
        centsPerSession: 3000,
      });
    });
  });
});
