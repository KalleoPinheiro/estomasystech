import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import {
  type ReceiptParties,
  resolveReceiptParties,
} from '@/domain/billing/receipt';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError } from '@/domain/shared/errors';

export interface ResolveReceiptInput {
  invoiceId: string;
  paymentId: string;
  clinicId: string;
}

/**
 * Reúne quem paga e quem presta o serviço para o recibo de um recebimento
 * (#326). Lança `ValidationError` com orientação quando falta CPF ou CNPJ: é
 * a mesma checagem da tela e da emissão persistida, então não há como emitir
 * recibo sem os documentos exigidos para o IRPF.
 */
export class ResolveReceipt {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly patients: PatientRepository,
    private readonly clinics: ClinicRepository,
  ) {}

  async execute(input: ResolveReceiptInput): Promise<ReceiptParties> {
    const invoice = await this.invoices.findById(input.invoiceId);
    if (!invoice) throw new NotFoundError('Fatura', input.invoiceId);
    const payment = invoice.payments.find((p) => p.id === input.paymentId);
    if (!payment) throw new NotFoundError('Pagamento', input.paymentId);
    const [patient, clinic] = await Promise.all([
      this.patients.findById(invoice.patientId),
      this.clinics.findById(input.clinicId),
    ]);
    if (!patient) throw new NotFoundError('Paciente', invoice.patientId);
    if (!clinic) throw new NotFoundError('Empresa', input.clinicId);
    return resolveReceiptParties({
      clinic: { name: clinic.name, cnpj: clinic.cnpj },
      patient: { fullName: patient.fullName, cpf: patient.cpf },
      payer: payment.payer ?? null,
    });
  }
}
