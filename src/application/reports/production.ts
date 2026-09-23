import {
  type CommissionRelease,
  type ProducedSession,
  valueSession,
} from '@/domain/billing/commission';
import type { ProcedureRevenue } from '@/domain/scheduling/appointment-repository';

/** Soma das bases de comissão de um profissional, por estado de liberação. */
export interface ProfessionalTotals {
  professionalId: string | null;
  /** Sessões realizadas (inclui as de fatura cancelada). */
  count: number;
  /** Receita reconhecida (pacote rateado; fatura cancelada = 0). */
  revenueCents: number;
  releasedBaseCents: number;
  pendingBaseCents: number;
}

export interface ProductionAggregate {
  revenueByProcedure: ProcedureRevenue[];
  byProfessional: ProfessionalTotals[];
}

const emptyTotals = (professionalId: string | null): ProfessionalTotals => ({
  professionalId,
  count: 0,
  revenueCents: 0,
  releasedBaseCents: 0,
  pendingBaseCents: 0,
});

const addBase = (
  totals: ProfessionalTotals,
  release: CommissionRelease,
  baseCents: number,
): void => {
  if (release === 'released') totals.releasedBaseCents += baseCents;
  if (release === 'pending') totals.pendingBaseCents += baseCents;
};

/**
 * Agrega as sessões do período pela regra de `domain/billing/commission`:
 * receita por procedimento e bases de repasse por profissional.
 */
export function aggregateProduction(
  sessions: ProducedSession[],
  now: Date,
): ProductionAggregate {
  const byProcedure = new Map<string, ProcedureRevenue>();
  const byProfessional = new Map<string | null, ProfessionalTotals>();

  for (const session of sessions) {
    const valuation = valueSession(session, now);

    const procedure = byProcedure.get(session.procedure) ?? {
      procedure: session.procedure,
      count: 0,
      totalCents: 0,
    };
    procedure.count += 1;
    procedure.totalCents += valuation.revenueCents;
    byProcedure.set(session.procedure, procedure);

    const totals =
      byProfessional.get(session.professionalId) ??
      emptyTotals(session.professionalId);
    totals.count += 1;
    totals.revenueCents += valuation.revenueCents;
    addBase(totals, valuation.release, valuation.commissionBaseCents);
    byProfessional.set(session.professionalId, totals);
  }

  return {
    revenueByProcedure: [...byProcedure.values()].sort(
      (a, b) => b.totalCents - a.totalCents,
    ),
    byProfessional: [...byProfessional.values()],
  };
}
