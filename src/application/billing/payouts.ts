import type {
  CommissionRule,
  ProducedSession,
  ProducedSessionRepository,
} from '@/domain/billing/commission';
import {
  buildStatement,
  CommissionPayout,
  type CommissionPayoutRepository,
  isPeriodEnded,
  type PaidItemRef,
  type PayoutMethod,
  type PayoutStatement,
  periodBounds,
} from '@/domain/billing/commission-payout';
import type { Professional } from '@/domain/professional/professional';
import type { ProfessionalRepository } from '@/domain/professional/professional-repository';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';

/** Desde sempre: fechar um mês paga também liberações atrasadas de meses anteriores. */
const BEGINNING = new Date(0);

const EMPTY_STATEMENT: PayoutStatement = {
  payable: [],
  pending: [],
  payableCents: 0,
  pendingCents: 0,
};

export interface ProfessionalStatement {
  professional: Professional;
  rule: CommissionRule | null;
  statement: PayoutStatement;
  /** Repasse já registrado para o mês, se houver. */
  closedPayout: CommissionPayout | null;
}

function statementFor(
  professional: Professional,
  sessions: ProducedSession[],
  paid: PaidItemRef[],
  now: Date,
): PayoutStatement {
  const rule = professional.commissionRule;
  return rule ? buildStatement(sessions, paid, rule, now) : EMPTY_STATEMENT;
}

interface PayoutDeps {
  professionals: ProfessionalRepository;
  producedSessions: ProducedSessionRepository;
  payouts: CommissionPayoutRepository;
}

/** Extrato de um profissional para o fechamento do mês (prévia ou já fechado). */
export class GetPayoutStatement {
  constructor(private readonly deps: PayoutDeps) {}

  async execute(input: {
    professionalId: string;
    period: string;
    now?: Date;
  }): Promise<ProfessionalStatement> {
    const { end } = periodBounds(input.period);
    const professional = await this.deps.professionals.findById(
      input.professionalId,
    );
    if (!professional) {
      throw new NotFoundError('Profissional', input.professionalId);
    }
    const [sessions, paid, closed] = await Promise.all([
      this.deps.producedSessions.findCompletedInRange(BEGINNING, end, {
        professionalId: professional.id,
      }),
      this.deps.payouts.findPaidItems(professional.id),
      this.deps.payouts.findAll({
        professionalId: professional.id,
        period: input.period,
      }),
    ]);
    return {
      professional,
      rule: professional.commissionRule,
      statement: statementFor(
        professional,
        sessions,
        paid,
        input.now ?? new Date(),
      ),
      closedPayout: closed[0] ?? null,
    };
  }
}

/** Visão do Admin: todos os profissionais da clínica no fechamento do mês. */
export class GetPayoutOverview {
  constructor(private readonly deps: PayoutDeps) {}

  async execute(input: {
    period: string;
    now?: Date;
  }): Promise<ProfessionalStatement[]> {
    const { end } = periodBounds(input.period);
    const now = input.now ?? new Date();
    const [professionals, sessions, paid, closed] = await Promise.all([
      this.deps.professionals.findAll(),
      this.deps.producedSessions.findCompletedInRange(BEGINNING, end),
      this.deps.payouts.findPaidItems(),
      this.deps.payouts.findAll({ period: input.period }),
    ]);
    return professionals
      .map((professional) => ({
        professional,
        rule: professional.commissionRule,
        statement: statementFor(
          professional,
          sessions.filter((s) => s.professionalId === professional.id),
          paid.filter((p) => p.professionalId === professional.id),
          now,
        ),
        closedPayout:
          closed.find((p) => p.professionalId === professional.id) ?? null,
      }))
      .filter(
        (row) =>
          row.professional.isActive ||
          row.closedPayout != null ||
          row.statement.payable.length > 0,
      );
  }
}

export interface ClosePayoutInput {
  professionalId: string;
  period: string;
  paidAt: Date;
  paymentMethod: PayoutMethod;
  notes?: string | null;
  /** Quem registrou (e-mail da sessão do Admin). */
  createdBy: string;
  now?: Date;
}

/**
 * Fechamento mensal: congela e paga o que está liberado até o fim do mês.
 * Um fechamento por profissional por mês; só mês já encerrado.
 */
export class ClosePayout {
  constructor(private readonly deps: PayoutDeps) {}

  async execute(input: ClosePayoutInput): Promise<CommissionPayout> {
    const now = input.now ?? new Date();
    if (!isPeriodEnded(input.period, now)) {
      throw new ValidationError(
        'Só é possível fechar um mês depois que ele terminar',
      );
    }
    const { professional, rule, statement, closedPayout } =
      await new GetPayoutStatement(this.deps).execute({
        professionalId: input.professionalId,
        period: input.period,
        now,
      });
    if (closedPayout) {
      throw new ConflictError(
        `O repasse de ${input.period} deste profissional já foi registrado`,
      );
    }
    if (!rule) {
      throw new ValidationError(
        `${professional.fullName} não tem regra de repasse configurada`,
      );
    }
    const payout = CommissionPayout.create({
      professionalId: professional.id,
      period: input.period,
      paidAt: input.paidAt,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      createdBy: input.createdBy,
      items: statement.payable,
    });
    await this.deps.payouts.save(payout);
    return payout;
  }
}
