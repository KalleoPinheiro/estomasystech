import {
  InvalidStatusTransitionError,
  ValidationError,
} from '../shared/errors';
import { newId } from '../shared/id';
import type { Money } from '../shared/money';

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

export interface InvoiceState extends InvoiceProps {
  id: string;
  status: InvoiceStatus;
  issuedAt: Date;
  paidAt: Date | null;
  paymentMethod: PaymentMethod | null;
}

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
    });
  }

  static restore(state: InvoiceState): Invoice {
    return new Invoice({ ...state });
  }

  markPaid(method: PaymentMethod, paidAt: Date = new Date()): Invoice {
    if (this.state.status !== 'pending') {
      throw new InvalidStatusTransitionError(
        `Não é possível pagar fatura com status "${this.state.status}"`,
      );
    }
    return new Invoice({
      ...this.state,
      status: 'paid',
      paymentMethod: method,
      paidAt,
    });
  }

  cancel(): Invoice {
    if (this.state.status !== 'pending') {
      throw new InvalidStatusTransitionError(
        `Não é possível cancelar fatura com status "${this.state.status}"`,
      );
    }
    return new Invoice({ ...this.state, status: 'cancelled' });
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
