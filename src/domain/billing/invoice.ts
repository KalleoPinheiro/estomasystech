import { normalizeCpf } from '../shared/cpf';
import {
  ConflictError,
  InvalidStatusTransitionError,
  ValidationError,
} from '../shared/errors';
import { newId } from '../shared/id';
import { Money } from '../shared/money';

export const INVOICE_STATUSES = ['pending', 'paid', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = [
  'pix',
  'cash',
  'credit_card',
  'debit_card',
  'insurance',
  'transfer',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface InvoiceProps {
  patientId: string;
  description: string;
  amount: Money;
  appointmentId?: string | null;
  /** Pacote de sessões cuja venda esta fatura cobra. */
  sessionPackageId?: string | null;
  dueDate?: Date | null;
}

/** Quem pagou, quando não é o paciente (#326): nome e CPF, para o recibo do IRPF. */
export interface PaymentPayer {
  name: string;
  /** 11 dígitos. */
  cpf: string;
}

/** Recebimento (total ou parcial) de uma fatura — imutável depois de gravado. */
export interface InvoicePayment {
  id: string;
  amount: Money;
  method: PaymentMethod;
  paidAt: Date;
  /** Ausente = o próprio paciente pagou. */
  payer?: PaymentPayer | null;
}

export interface InvoiceDiscount {
  amount: Money;
  reason: string;
}

export interface InvoiceState extends InvoiceProps {
  id: string;
  status: InvoiceStatus;
  issuedAt: Date;
  /** Data do pagamento que quitou a fatura. */
  paidAt: Date | null;
  /** Forma do pagamento que quitou a fatura. */
  paymentMethod: PaymentMethod | null;
  discount?: InvoiceDiscount | null;
  payments?: InvoicePayment[];
}

export interface RegisterPaymentInput {
  amount: Money;
  method: PaymentMethod;
  paidAt?: Date;
  payer?: { name: string; cpf: string } | null;
}

const MIN_PAYER_NAME_LENGTH = 3;

/** Pagador distinto do paciente: nome e CPF válido, ou nada. */
function normalizePayer(
  payer: RegisterPaymentInput['payer'],
): PaymentPayer | null {
  if (!payer) return null;
  const name = payer.name.trim();
  if (name.length < MIN_PAYER_NAME_LENGTH) {
    throw new ValidationError(
      `Nome do pagador deve ter pelo menos ${MIN_PAYER_NAME_LENGTH} caracteres`,
    );
  }
  return { name, cpf: normalizeCpf(payer.cpf) };
}

const MAX_DISCOUNT_REASON_LENGTH = 200;

export class Invoice {
  private constructor(private readonly state: InvoiceState) {}

  static create(props: InvoiceProps): Invoice {
    const description = props.description.trim();
    if (description.length === 0) {
      throw new ValidationError('Descrição da fatura é obrigatória');
    }
    if (props.amount.isZero()) {
      throw new ValidationError('Valor da fatura deve ser maior que zero');
    }
    if (props.patientId.trim().length === 0) {
      throw new ValidationError('Paciente é obrigatório');
    }
    return new Invoice({
      ...props,
      description,
      appointmentId: props.appointmentId ?? null,
      sessionPackageId: props.sessionPackageId ?? null,
      dueDate: props.dueDate ?? null,
      id: newId(),
      status: 'pending',
      issuedAt: new Date(),
      paidAt: null,
      paymentMethod: null,
      discount: null,
      payments: [],
    });
  }

  static restore(state: InvoiceState): Invoice {
    return new Invoice({ ...state });
  }

  private assertPending(action: string): void {
    if (this.state.status !== 'pending') {
      throw new InvalidStatusTransitionError(
        `Não é possível ${action} fatura com status "${this.state.status}"`,
      );
    }
  }

  /** Quita o saldo restante de uma vez (fluxo histórico "marcar como paga"). */
  markPaid(
    method: PaymentMethod,
    paidAt: Date = new Date(),
    payer?: RegisterPaymentInput['payer'],
  ): Invoice {
    this.assertPending('pagar');
    return this.registerPayment({
      amount: this.balance,
      method,
      paidAt,
      payer,
    });
  }

  /**
   * Recebimento parcial ou total. A fatura só vira `paid` quando o saldo zera
   * — até lá continua pendente (e a comissão, que segue a fatura paga, também).
   */
  registerPayment(input: RegisterPaymentInput): Invoice {
    this.assertPending('receber pagamento de');
    if (input.amount.isZero()) {
      throw new ValidationError('Valor do pagamento deve ser maior que zero');
    }
    if (input.amount.cents > this.balance.cents) {
      throw new ValidationError(
        `Pagamento maior que o saldo da fatura (${this.balance.format()})`,
      );
    }
    const paidAt = input.paidAt ?? new Date();
    const payments = [
      ...this.payments,
      {
        id: newId(),
        amount: input.amount,
        method: input.method,
        paidAt,
        payer: normalizePayer(input.payer),
      },
    ];
    const settled = input.amount.cents === this.balance.cents;
    return new Invoice({
      ...this.state,
      payments,
      ...(settled
        ? { status: 'paid' as const, paidAt, paymentMethod: input.method }
        : {}),
    });
  }

  /**
   * Desconto sobre o valor da fatura, com motivo — só enquanto pendente e sem
   * ficar abaixo do que já foi recebido. Desconto total é cancelamento, não
   * desconto. Um novo desconto substitui o anterior.
   */
  applyDiscount(amount: Money, reason: string): Invoice {
    this.assertPending('dar desconto em');
    const trimmed = reason.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_DISCOUNT_REASON_LENGTH) {
      throw new ValidationError(
        `Motivo do desconto é obrigatório (até ${MAX_DISCOUNT_REASON_LENGTH} caracteres)`,
      );
    }
    if (amount.cents >= this.state.amount.cents) {
      throw new ValidationError(
        'Desconto deve ser menor que o valor da fatura — para não cobrar nada, cancele a fatura',
      );
    }
    const net = this.state.amount.cents - amount.cents;
    if (net < this.paid.cents) {
      throw new ValidationError(
        `Com esse desconto, a fatura ficaria abaixo do já recebido (${this.paid.format()})`,
      );
    }
    const discounted = new Invoice({
      ...this.state,
      discount: amount.isZero() ? null : { amount, reason: trimmed },
    });
    // Desconto que iguala o valor líquido ao já recebido quita a fatura.
    const lastPayment = this.payments.at(-1);
    return net === this.paid.cents && lastPayment
      ? new Invoice({
          ...discounted.state,
          status: 'paid',
          paidAt: lastPayment.paidAt,
          paymentMethod: lastPayment.method,
        })
      : discounted;
  }

  cancel(): Invoice {
    this.assertPending('cancelar');
    if (this.payments.length > 0) {
      throw new ConflictError(
        'Fatura com pagamento parcial não pode ser cancelada — dê desconto no saldo restante',
      );
    }
    return new Invoice({ ...this.state, status: 'cancelled' });
  }

  get discount(): InvoiceDiscount | null {
    return this.state.discount ?? null;
  }

  get payments(): InvoicePayment[] {
    return [...(this.state.payments ?? [])];
  }

  /** Valor a cobrar: valor da fatura menos o desconto. */
  get netAmount(): Money {
    return this.state.amount.subtract(this.discount?.amount ?? Money.zero());
  }

  /** Total recebido. Fatura paga do histórico (sem registro de pagamento) conta o líquido. */
  get paid(): Money {
    const payments = this.payments;
    if (payments.length === 0) {
      return this.state.status === 'paid' ? this.netAmount : Money.zero();
    }
    return payments.reduce((sum, p) => sum.add(p.amount), Money.zero());
  }

  /** Saldo a receber (zero em faturas pagas ou canceladas). */
  get balance(): Money {
    if (this.state.status !== 'pending') {
      return Money.zero();
    }
    return this.netAmount.subtract(this.paid);
  }

  get id(): string {
    return this.state.id;
  }

  get patientId(): string {
    return this.state.patientId;
  }

  get appointmentId(): string | null {
    return this.state.appointmentId ?? null;
  }

  get sessionPackageId(): string | null {
    return this.state.sessionPackageId ?? null;
  }

  get description(): string {
    return this.state.description;
  }

  get amount(): Money {
    return this.state.amount;
  }

  get status(): InvoiceStatus {
    return this.state.status;
  }

  get issuedAt(): Date {
    return this.state.issuedAt;
  }

  get dueDate(): Date | null {
    return this.state.dueDate ?? null;
  }

  get paidAt(): Date | null {
    return this.state.paidAt;
  }

  get paymentMethod(): PaymentMethod | null {
    return this.state.paymentMethod;
  }
}
