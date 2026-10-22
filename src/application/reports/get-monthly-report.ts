import {
  type BillingSummary,
  GetBillingSummary,
} from '@/application/billing/get-billing-summary';
import type { ProducedSessionRepository } from '@/domain/billing/commission';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import type { StockMovementRepository } from '@/domain/inventory/inventory-repositories';
import type { Professional } from '@/domain/professional/professional';
import type { ProfessionalRepository } from '@/domain/professional/professional-repository';
import type { AppointmentStatus } from '@/domain/scheduling/appointment';
import type {
  AppointmentRepository,
  ProcedureRevenue,
} from '@/domain/scheduling/appointment-repository';
import { aggregateProduction, type ProfessionalTotals } from './production';

export type { ProcedureRevenue };

export interface ProcedureMargin extends ProcedureRevenue {
  supplyCostCents: number;
  /**
   * Há saída de insumo vinculada a consultas do procedimento. Sem isso o custo
   * não foi apurado e a margem (= receita) não deve ser lida como margem real.
   */
  supplyCostKnown: boolean;
  marginCents: number;
}

export interface ProfessionalProduction {
  professionalId: string | null;
  professionalName: string;
  /** Sessões realizadas no mês. */
  count: number;
  /** Receita reconhecida (sessão de pacote = preço ÷ sessões; fatura cancelada = 0). */
  totalCents: number;
  /**
   * Comissão apurada na produção do mês (liberada + a liberar); null quando o
   * profissional não tem %. Regra em `domain/billing/commission.ts`.
   */
  commissionCents: number | null;
  /** Já pode entrar no repasse: fatura paga, cortesia ou atraso ≥ 60 dias. */
  releasedCommissionCents: number | null;
  /** Aguardando o pagamento da fatura. */
  pendingCommissionCents: number | null;
}

export interface MonthlyReport {
  totalAppointments: number;
  byStatus: Record<AppointmentStatus, number>;
  noShowRate: number;
  revenueByProcedure: ProcedureMargin[];
  /** Saídas de material do período sem vínculo com consulta. */
  unattributedSupplyCostCents: number;
  totalSupplyCostCents: number;
  productionByProfessional: ProfessionalProduction[];
  billing: BillingSummary;
}

export interface MonthlyReportInput {
  from: Date;
  to: Date;
  /** Referência para liberação por atraso (testes). */
  now?: Date;
}

/**
 * Relatório que não muda mais: sem consulta aberta, fatura pendente ou
 * comissão a liberar. Mês encerrado ainda muda quando uma fatura é paga
 * depois — só relatório assentado pode ir para o cache.
 */
export function isReportSettled(report: MonthlyReport): boolean {
  return (
    report.byStatus.scheduled === 0 &&
    report.byStatus.confirmed === 0 &&
    report.billing.pendingCount === 0 &&
    report.productionByProfessional.every(
      (row) => (row.pendingCommissionCents ?? 0) === 0,
    )
  );
}

export class GetMonthlyReport {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly invoices: InvoiceRepository,
    private readonly producedSessions: ProducedSessionRepository,
    private readonly stockMovements?: StockMovementRepository,
    private readonly professionals?: ProfessionalRepository,
  ) {}

  async execute(input: MonthlyReportInput): Promise<MonthlyReport> {
    const [stats, billing, outflowCosts, sessions] = await Promise.all([
      this.appointments.getStatsInRange(input.from, input.to),
      new GetBillingSummary(this.invoices).execute(input),
      this.stockMovements?.getOutflowCostInRange(input.from, input.to) ??
        Promise.resolve([]),
      this.producedSessions.findCompletedInRange(input.from, input.to),
    ]);

    const { byStatus } = stats;
    const professionalIds = sessions
      .map((s) => s.professionalId)
      .filter((id): id is string => id != null);
    const professionals =
      (await this.professionals?.findByIds(professionalIds)) ?? [];
    const byId = new Map(professionals.map((p) => [p.id, p]));
    const { revenueByProcedure, byProfessional } = aggregateProduction(
      sessions,
      input.now ?? new Date(),
      (id) => (id ? (byId.get(id)?.commissionRule ?? null) : null),
    );
    const totalAppointments = Object.values(byStatus).reduce(
      (sum, count) => sum + count,
      0,
    );
    const nonCancelled = totalAppointments - byStatus.cancelled;
    const noShowRate = nonCancelled > 0 ? byStatus.no_show / nonCancelled : 0;

    // Custo por procedimento: saídas vinculadas → consulta → procedimento.
    const attributed = outflowCosts.filter(
      (c): c is { appointmentId: string; totalCents: number } =>
        c.appointmentId != null,
    );
    const linkedAppointments = await this.appointments.findByIds(
      attributed.map((c) => c.appointmentId),
    );
    const procedureById = new Map(
      linkedAppointments.map((a) => [a.id, a.procedure]),
    );
    const costByProcedure = new Map<string, number>();
    let orphanCostCents = 0;
    for (const cost of attributed) {
      const procedure = procedureById.get(cost.appointmentId);
      if (procedure) {
        costByProcedure.set(
          procedure,
          (costByProcedure.get(procedure) ?? 0) + cost.totalCents,
        );
      } else {
        orphanCostCents += cost.totalCents;
      }
    }
    const unattributedSupplyCostCents =
      outflowCosts
        .filter((c) => c.appointmentId == null)
        .reduce((sum, c) => sum + c.totalCents, 0) + orphanCostCents;
    const totalSupplyCostCents = outflowCosts.reduce(
      (sum, c) => sum + c.totalCents,
      0,
    );

    return {
      totalAppointments,
      byStatus,
      noShowRate,
      revenueByProcedure: revenueByProcedure.map((entry) => {
        const supplyCostCents = costByProcedure.get(entry.procedure) ?? 0;
        return {
          ...entry,
          supplyCostCents,
          supplyCostKnown: costByProcedure.has(entry.procedure),
          marginCents: entry.totalCents - supplyCostCents,
        };
      }),
      unattributedSupplyCostCents,
      totalSupplyCostCents,
      productionByProfessional: buildProduction(byProfessional, byId),
      billing,
    };
  }
}

function buildProduction(
  totals: ProfessionalTotals[],
  byId: Map<string, Professional>,
): ProfessionalProduction[] {
  return totals
    .map((entry) => {
      const professional = entry.professionalId
        ? byId.get(entry.professionalId)
        : undefined;
      const released = entry.releasedCommissionCents;
      const pending = entry.pendingCommissionCents;
      return {
        professionalId: entry.professionalId,
        professionalName: professional?.fullName ?? 'Sem atribuição',
        count: entry.count,
        totalCents: entry.revenueCents,
        commissionCents:
          released != null && pending != null ? released + pending : null,
        releasedCommissionCents: released,
        pendingCommissionCents: pending,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);
}
