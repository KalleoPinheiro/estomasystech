import { describe, expect, it } from 'vitest';
import { aggregateProduction } from '@/application/reports/production';
import {
  type BillingRef,
  commissionCents,
  OVERDUE_RELEASE_DAYS,
  type ProducedSession,
  releaseFor,
  valueSession,
} from '@/domain/billing/commission';

const NOW = new Date('2026-09-30T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const bill = (
  status: BillingRef['status'],
  issuedDaysAgo = 1,
  dueDate: Date | null = null,
): BillingRef => ({ status, issuedAt: daysAgo(issuedDaysAgo), dueDate });

const session = (
  overrides: Partial<ProducedSession> = {},
): ProducedSession => ({
  appointmentId: 'a-1',
  professionalId: 'prof-1',
  procedure: 'Curativo',
  sessionDate: daysAgo(10),
  listPriceCents: 15000,
  invoice: bill('pending'),
  package: null,
  ...overrides,
});

describe('Feature: Regra de repasse ao profissional', () => {
  describe('Liberação da comissão (releaseFor)', () => {
    it('Dada fatura paga, Então liberada', () => {
      expect(releaseFor(bill('paid'), NOW)).toBe('released');
    });

    it('Dada fatura cancelada, Então anulada (sem receita nem repasse)', () => {
      expect(releaseFor(bill('cancelled'), NOW)).toBe('void');
    });

    it('Dada fatura pendente dentro do prazo, Então a liberar', () => {
      expect(releaseFor(bill('pending', OVERDUE_RELEASE_DAYS - 1), NOW)).toBe(
        'pending',
      );
    });

    it('Dada fatura pendente há 60 dias ou mais, Então liberada — inadimplência é risco da clínica', () => {
      expect(releaseFor(bill('pending', OVERDUE_RELEASE_DAYS), NOW)).toBe(
        'released',
      );
    });

    it('Dado vencimento definido, Então o atraso conta do vencimento, não da emissão', () => {
      // Emitida há 90 dias, mas vence só há 10 → ainda dentro do prazo.
      expect(releaseFor(bill('pending', 90, daysAgo(10)), NOW)).toBe('pending');
      expect(
        releaseFor(bill('pending', 90, daysAgo(OVERDUE_RELEASE_DAYS)), NOW),
      ).toBe('released');
    });

    it('Dada sessão sem fatura vinculada (histórico), Então liberada', () => {
      expect(releaseFor(null, NOW)).toBe('released');
    });
  });

  describe('Valor da sessão (valueSession)', () => {
    it('Dada consulta avulsa, Então receita e base = preço da consulta', () => {
      expect(valueSession(session(), NOW)).toEqual({
        revenueCents: 15000,
        commissionBaseCents: 15000,
        release: 'pending',
      });
    });

    it('Dada consulta com fatura cancelada, Então receita e base zeradas', () => {
      expect(
        valueSession(session({ invoice: bill('cancelled') }), NOW),
      ).toEqual({ revenueCents: 0, commissionBaseCents: 0, release: 'void' });
    });

    it('Dada sessão de pacote, Então vale preço do pacote ÷ sessões (não o preço cheio)', () => {
      const valuation = valueSession(
        session({
          invoice: null,
          package: {
            priceCents: 100000,
            totalSessions: 10,
            invoice: bill('paid'),
          },
        }),
        NOW,
      );

      expect(valuation).toEqual({
        revenueCents: 10000,
        commissionBaseCents: 10000,
        release: 'released',
      });
    });

    it('Dado rateio não exato, Então arredonda ao centavo', () => {
      const valuation = valueSession(
        session({
          package: { priceCents: 10000, totalSessions: 3, invoice: null },
        }),
        NOW,
      );
      expect(valuation.revenueCents).toBe(3333);
    });

    it('Dada sessão de pacote com a fatura da venda pendente, Então a liberar', () => {
      const valuation = valueSession(
        session({
          package: {
            priceCents: 50000,
            totalSessions: 5,
            invoice: bill('pending'),
          },
        }),
        NOW,
      );
      expect(valuation.release).toBe('pending');
    });

    it('Dada sessão de pacote cuja venda foi cancelada, Então sem receita nem repasse', () => {
      const valuation = valueSession(
        session({
          package: {
            priceCents: 50000,
            totalSessions: 5,
            invoice: bill('cancelled'),
          },
        }),
        NOW,
      );
      expect(valuation).toEqual({
        revenueCents: 0,
        commissionBaseCents: 0,
        release: 'void',
      });
    });

    it('Dado pacote cortesia, Então receita zero mas repasse sobre o preço normal, já liberado', () => {
      const valuation = valueSession(
        session({
          listPriceCents: 15000,
          package: { priceCents: 0, totalSessions: 5, invoice: null },
        }),
        NOW,
      );
      expect(valuation).toEqual({
        revenueCents: 0,
        commissionBaseCents: 15000,
        release: 'released',
      });
    });
  });

  it('Dado percentual, Quando calcular comissão, Então arredonda ao centavo', () => {
    expect(commissionCents(3333, 40)).toBe(1333);
  });

  describe('Agregação do período (aggregateProduction)', () => {
    it('Dadas sessões mistas, Então separa liberado/a liberar e não conta pacote em dobro', () => {
      const { revenueByProcedure, byProfessional } = aggregateProduction(
        [
          session({ appointmentId: 'paga', invoice: bill('paid') }),
          session({ appointmentId: 'pendente', invoice: bill('pending') }),
          session({ appointmentId: 'cancelada', invoice: bill('cancelled') }),
          session({
            appointmentId: 'pacote',
            invoice: null,
            package: {
              priceCents: 100000,
              totalSessions: 10,
              invoice: bill('paid'),
            },
          }),
          session({
            appointmentId: 'outro',
            professionalId: null,
            procedure: 'Troca de bolsa',
            listPriceCents: 25000,
            invoice: bill('paid'),
          }),
        ],
        NOW,
        (id) => (id === 'prof-1' ? { kind: 'percentage', pct: 40 } : null),
      );

      expect(revenueByProcedure).toEqual([
        // 15000 paga + 15000 pendente + 0 cancelada + 10000 pacote
        { procedure: 'Curativo', count: 4, totalCents: 40000 },
        { procedure: 'Troca de bolsa', count: 1, totalCents: 25000 },
      ]);
      expect(byProfessional.find((p) => p.professionalId === 'prof-1')).toEqual(
        {
          professionalId: 'prof-1',
          count: 4,
          revenueCents: 40000,
          // 40% por sessão: paga (6000) + pacote (4000) liberados; pendente 6000.
          releasedCommissionCents: 10000,
          pendingCommissionCents: 6000,
        },
      );
      // Sem regra configurada, o repasse fica null (não zero).
      expect(
        byProfessional.find((p) => p.professionalId === null)
          ?.releasedCommissionCents,
      ).toBeNull();
    });

    it('Dada regra de valor fixo, Então cada sessão liberada vale o fixo, independente do preço', () => {
      const { byProfessional } = aggregateProduction(
        [
          session({ appointmentId: 'x', invoice: bill('paid') }),
          session({
            appointmentId: 'y',
            invoice: bill('paid'),
            listPriceCents: 90000,
          }),
          session({ appointmentId: 'z', invoice: bill('cancelled') }),
        ],
        NOW,
        () => ({ kind: 'fixed', centsPerSession: 5000 }),
      );
      expect(byProfessional[0]).toMatchObject({
        releasedCommissionCents: 10000,
        pendingCommissionCents: 0,
      });
    });
  });
});
