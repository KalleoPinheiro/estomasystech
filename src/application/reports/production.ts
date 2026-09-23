import {
  type CommissionRule,
  type ProducedSession,
  sessionCommission,
  valueSession,
} from '@/domain/billing/commission';
import type { ProcedureRevenue } from '@/domain/scheduling/appointment-repository';

/** Totais do período por profissional. */
export interface ProfessionalTotals {
  professionalId: string | null;
  /** Sessões realizadas (inclui as de fatura cancelada). */
  count: number;
  /** Receita reconhecida (pacote rateado; fatura cancelada = 0). */
  revenueCents: number;
  /** Repasse já liberado / aguardando pagamento; `null` sem regra configurada. */
  releasedCommissionCents: number | null;
  pendingCommissionCents: number | null;
}

export interface ProductionAggregate {
  revenueByProcedure: ProcedureRevenue[];
  byProfessional: ProfessionalTotals[];
}

/** Regra de repasse do profissional; `null` = sem regra (ou sem profissional). */
export type RuleLookup = (
  professionalId: string | null,
) => CommissionRule | null;

const emptyTotals = (
  professionalId: string | null,
  hasRule: boolean,
): ProfessionalTotals => ({
  professionalId,
  count: 0,
  revenueCents: 0,
  releasedCommissionCents: hasRule ? 0 : null,
  pendingCommissionCents: hasRule ? 0 : null,
});

function addSession(
  totals: ProfessionalTotals,
  session: ProducedSession,
  rule: CommissionRule | null,
  now: Date,
): void {
  const valuation = valueSession(session, now);
  totals.count += 1;
  totals.revenueCents += valuation.revenueCents;
  if (!rule) return;
  // Mesmo cálculo por sessão do livro de repasses — relatório e fechamento
  // nunca divergem por arredondamento.
  const commission = sessionCommission(rule, valuation);
  if (valuation.release === 'released') {
    totals.releasedCommissionCents =
      (totals.releasedCommissionCents ?? 0) + commission;
  } else if (valuation.release === 'pending') {
    totals.pendingCommissionCents =
      (totals.pendingCommissionCents ?? 0) + commission;
  }
}

/**
 * Agrega as sessões do período pela regra de `domain/billing/commission`:
 * receita por procedimento e repasse por profissional (percentual ou fixo).
 */
export function aggregateProduction(
  sessions: ProducedSession[],
  now: Date,
  ruleOf: RuleLookup = () => null,
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

    const rule = ruleOf(session.professionalId);
    const totals =
      byProfessional.get(session.professionalId) ??
      emptyTotals(session.professionalId, rule != null);
    addSession(totals, session, rule, now);
    byProfessional.set(session.professionalId, totals);
  }

  return {
    revenueByProcedure: [...byProcedure.values()].sort(
      (a, b) => b.totalCents - a.totalCents,
    ),
    byProfessional: [...byProfessional.values()],
  };
}
