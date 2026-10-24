import { Invoice } from '@/domain/billing/invoice';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import type {
  Appointment,
  CancellationOrigin,
} from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import {
  type CancellationPolicy,
  DEFAULT_CANCELLATION_POLICY,
  isLateChange,
} from '@/domain/scheduling/schedule-config';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { zonedParts } from '@/domain/shared/time-zone';

export interface StaffAbsenceResult {
  appointment: Appointment;
  /** Fatura da taxa, quando cobrada. */
  feeInvoice: Invoice | null;
}

const dayMonth = (date: Date): string => {
  const { day, month } = zonedParts(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
};

/**
 * Taxa de cancelamento tardio/falta: fatura pendente comum, ligada à consulta
 * (que nunca vira sessão concluída, então não entra em comissão).
 */
function feeInvoice(
  appointment: Appointment,
  policy: CancellationPolicy,
  label: string,
): Invoice {
  if (policy.lateFeeCents <= 0) {
    throw new ValidationError(
      'A clínica não tem taxa de cancelamento configurada',
    );
  }
  return Invoice.create({
    patientId: appointment.patientId,
    description: `${label} — ${appointment.procedure} em ${dayMonth(appointment.slot.start)}`,
    amount: Money.fromCents(policy.lateFeeCents),
    appointmentId: appointment.id,
  });
}

abstract class StaffAbsenceUseCase {
  constructor(
    protected readonly appointments: AppointmentRepository,
    protected readonly invoices: InvoiceRepository,
    protected readonly policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY,
  ) {}

  protected async load(id: string): Promise<Appointment> {
    const appointment = await this.appointments.findById(id);
    if (!appointment) {
      throw new NotFoundError('Consulta', id);
    }
    return appointment;
  }

  protected async persist(
    appointment: Appointment,
    fee: Invoice | null,
  ): Promise<StaffAbsenceResult> {
    await this.appointments.save(appointment);
    if (fee) {
      await this.invoices.save(fee);
    }
    return { appointment, feeInvoice: fee };
  }
}

export interface CancelAppointmentByStaffInput {
  id: string;
  /** Quem pediu: a clínica (padrão) ou o paciente, por telefone/presencial. */
  requestedBy?: CancellationOrigin;
  reason?: string | null;
  /** Cobrar a taxa da política — só vale para cancelamento tardio do paciente. */
  chargeLateFee?: boolean;
  now?: Date;
}

/**
 * Cancelamento registrado pela equipe. Pedido do paciente dentro da
 * antecedência mínima fica marcado como tardio e pode gerar a taxa.
 */
export class CancelAppointmentByStaff extends StaffAbsenceUseCase {
  async execute(
    input: CancelAppointmentByStaffInput,
  ): Promise<StaffAbsenceResult> {
    const appointment = await this.load(input.id);
    const now = input.now ?? new Date();
    const by = input.requestedBy ?? 'clinic';
    const late =
      by === 'patient' &&
      isLateChange(appointment.slot.start, now, this.policy);

    if (input.chargeLateFee && !late) {
      throw new ValidationError(
        'A taxa só se aplica a cancelamento pedido pelo paciente com menos antecedência que a política da clínica',
      );
    }
    const cancelled = appointment.cancel({
      by,
      at: now,
      reason: input.reason ?? null,
      late,
    });
    const fee = input.chargeLateFee
      ? feeInvoice(cancelled, this.policy, 'Taxa de cancelamento tardio')
      : null;
    return this.persist(cancelled, fee);
  }
}

export interface MarkNoShowInput {
  id: string;
  chargeLateFee?: boolean;
}

/** Falta registrada pela equipe, com a taxa da política quando pedida. */
export class MarkNoShow extends StaffAbsenceUseCase {
  async execute(input: MarkNoShowInput): Promise<StaffAbsenceResult> {
    const appointment = await this.load(input.id);
    const missed = appointment.markNoShow();
    const fee = input.chargeLateFee
      ? feeInvoice(missed, this.policy, 'Taxa de não comparecimento')
      : null;
    return this.persist(missed, fee);
  }
}
