import {
  InvalidStatusTransitionError,
  ValidationError,
} from '../shared/errors';
import { newId } from '../shared/id';
import {
  type CommissionRule,
  type ProducedSession,
  sessionCommission,
  valueSession,
} from './commission';

/**
 * Livro de repasses (decisão de negócio de 2026-09-23): fechamento **mensal**
 * por profissional, registrado só pelo Admin da clínica. Fechar o mês M paga
 * tudo o que foi liberado até o fim de M e ainda não foi pago — inclusive
 * liberações atrasadas de meses anteriores. Cada sessão é paga uma única vez;
 * o valor fica congelado no item. Sessão já paga cuja fatura foi cancelada
 * depois vira estorno (valor negativo) no próximo fechamento.
 */

export const PAYOUT_METHODS = ['pix', 'transfer', 'cash'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export type PayoutItemKind = 'session' | 'reversal';

export interface PayoutItem {
  appointmentId: string;
  kind: PayoutItemKind;
  procedure: string;
  sessionDate: Date;
  baseCents: number;
  /** Negativo nos estornos. */
  commissionCents: number;
}

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-09" → [1º/set 00:00, 1º/out 00:00) no fuso local (mesma régua do relatório). */
export function periodBounds(period: string): { start: Date; end: Date } {
  if (!PERIOD_PATTERN.test(period)) {
    throw new ValidationError('Mês deve estar no formato AAAA-MM');
  }
  const [year, month] = period.split('-').map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

/** Só mês encerrado pode ser fechado — o mês corrente ainda produz sessões. */
export function isPeriodEnded(period: string, now: Date): boolean {
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return periodBounds(period).end.getTime() <= startOfCurrentMonth.getTime();
}

export interface PaidItemRef {
  professionalId: string;
  appointmentId: string;
  kind: PayoutItemKind;
  commissionCents: number;
}

export interface PayoutStatement {
  /** O que entra no próximo fechamento: sessões liberadas não pagas + estornos. */
  payable: PayoutItem[];
  /** Sessões realizadas aguardando pagamento da fatura (informativo). */
  pending: PayoutItem[];
  payableCents: number;
  pendingCents: number;
}

const toItem = (
  session: ProducedSession,
  kind: PayoutItemKind,
  baseCents: number,
  commissionCents: number,
): PayoutItem => ({
  appointmentId: session.appointmentId,
  kind,
  procedure: session.procedure,
  sessionDate: session.sessionDate,
  baseCents,
  commissionCents,
});

const sum = (items: PayoutItem[]): number =>
  items.reduce((total, item) => total + item.commissionCents, 0);

/**
 * Extrato de um profissional: `sessions` são as dele até o corte do mês;
 * `paid` são os itens já pagos (de qualquer fechamento).
 */
export function buildStatement(
  sessions: ProducedSession[],
  paid: PaidItemRef[],
  rule: CommissionRule,
  now: Date,
): PayoutStatement {
  const paidSessions = new Map<string, number>();
  const reversed = new Set<string>();
  for (const item of paid) {
    if (item.kind === 'session') {
      paidSessions.set(item.appointmentId, item.commissionCents);
    } else {
      reversed.add(item.appointmentId);
    }
  }

  const payable: PayoutItem[] = [];
  const pending: PayoutItem[] = [];
  for (const session of sessions) {
    const valuation = valueSession(session, now);
    const paidCents = paidSessions.get(session.appointmentId);
    if (paidCents !== undefined) {
      if (
        valuation.release === 'void' &&
        !reversed.has(session.appointmentId)
      ) {
        payable.push(toItem(session, 'reversal', 0, -paidCents));
      }
      continue;
    }
    const commission = sessionCommission(rule, valuation);
    const item = toItem(
      session,
      'session',
      valuation.commissionBaseCents,
      commission,
    );
    if (valuation.release === 'released' && commission > 0) {
      payable.push(item);
    } else if (valuation.release === 'pending') {
      pending.push(item);
    }
  }

  const byDate = (a: PayoutItem, b: PayoutItem) =>
    a.sessionDate.getTime() - b.sessionDate.getTime();
  payable.sort(byDate);
  pending.sort(byDate);
  return {
    payable,
    pending,
    payableCents: sum(payable),
    pendingCents: sum(pending),
  };
}

export type PayoutStatus = 'active' | 'cancelled';

/** Mínimo para o motivo do cancelamento dizer algo ("erro" não explica nada). */
const MIN_CANCEL_REASON = 5;

export interface CommissionPayoutProps {
  professionalId: string;
  period: string;
  paidAt: Date;
  paymentMethod: PayoutMethod;
  notes?: string | null;
  createdBy: string;
  /** Regra vigente no fechamento — retrato para o comprovante. */
  rule: CommissionRule | null;
  items: PayoutItem[];
}

export interface CommissionPayoutState extends CommissionPayoutProps {
  id: string;
  totalCents: number;
  notes: string | null;
  createdAt: Date;
  status: PayoutStatus;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
}

export class CommissionPayout {
  private constructor(private readonly state: CommissionPayoutState) {}

  static create(props: CommissionPayoutProps): CommissionPayout {
    periodBounds(props.period);
    if (!PAYOUT_METHODS.includes(props.paymentMethod)) {
      throw new ValidationError('Forma de pagamento do repasse inválida');
    }
    if (props.items.length === 0) {
      throw new ValidationError('Nada a pagar neste fechamento');
    }
    const totalCents = sum(props.items);
    if (totalCents <= 0) {
      throw new ValidationError(
        'Saldo do fechamento é zero ou negativo — os estornos serão descontados no próximo mês',
      );
    }
    return new CommissionPayout({
      ...props,
      notes: props.notes?.trim() || null,
      id: newId(),
      totalCents,
      createdAt: new Date(),
      status: 'active',
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
    });
  }

  /**
   * Repasse registrado por engano: cancela (nunca apaga) — as sessões voltam ao
   * saldo a pagar e o mês pode ser fechado de novo. O dinheiro já transferido é
   * acertado fora do sistema.
   */
  cancel(input: { by: string; reason: string; at?: Date }): CommissionPayout {
    if (this.state.status === 'cancelled') {
      throw new InvalidStatusTransitionError('Este repasse já foi cancelado');
    }
    const reason = input.reason.trim();
    if (reason.length < MIN_CANCEL_REASON) {
      throw new ValidationError(
        'Informe o motivo do cancelamento (ex.: valor errado, profissional errado)',
      );
    }
    return new CommissionPayout({
      ...this.state,
      status: 'cancelled',
      cancelledAt: input.at ?? new Date(),
      cancelledBy: input.by,
      cancelReason: reason,
    });
  }

  static restore(state: CommissionPayoutState): CommissionPayout {
    return new CommissionPayout({ ...state, items: [...state.items] });
  }

  get id(): string {
    return this.state.id;
  }

  get professionalId(): string {
    return this.state.professionalId;
  }

  get period(): string {
    return this.state.period;
  }

  get totalCents(): number {
    return this.state.totalCents;
  }

  get paidAt(): Date {
    return this.state.paidAt;
  }

  get paymentMethod(): PayoutMethod {
    return this.state.paymentMethod;
  }

  get notes(): string | null {
    return this.state.notes;
  }

  get createdBy(): string {
    return this.state.createdBy;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get items(): PayoutItem[] {
    return [...this.state.items];
  }

  get rule(): CommissionRule | null {
    return this.state.rule;
  }

  get status(): PayoutStatus {
    return this.state.status;
  }

  get isActive(): boolean {
    return this.state.status === 'active';
  }

  get cancelledAt(): Date | null {
    return this.state.cancelledAt;
  }

  get cancelledBy(): string | null {
    return this.state.cancelledBy;
  }

  get cancelReason(): string | null {
    return this.state.cancelReason;
  }
}

export interface PayoutFilter {
  professionalId?: string;
  period?: string;
}

export interface CommissionPayoutRepository {
  /** Grava repasse + itens juntos; sessão já paga → `ConflictError`. */
  save(payout: CommissionPayout): Promise<void>;
  /** Persiste o cancelamento e devolve as sessões ao saldo (itens inativos). */
  saveCancellation(payout: CommissionPayout): Promise<void>;
  findById(id: string): Promise<CommissionPayout | null>;
  /** Mais recentes primeiro; inclui os cancelados (histórico). */
  findAll(filter?: PayoutFilter): Promise<CommissionPayout[]>;
  /** Só itens de repasses ativos — cancelado não conta como pago. */
  findPaidItems(professionalId?: string): Promise<PaidItemRef[]>;
}
