import type { Invoice } from '@/domain/billing/invoice';
import type {
  InvoiceFilter,
  InvoiceRepository,
} from '@/domain/billing/invoice-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';

export interface InvoiceWithPatient {
  invoice: Invoice;
  patientName: string;
  /** Para desambiguar homônimos nas listas (CONTEXT.md). */
  patientBirthDate: Date | null;
}

export class ListInvoices {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(
    filter: InvoiceFilter = {},
    page: { limit?: number; cursor?: string } = {},
  ): Promise<InvoiceWithPatient[]> {
    const invoices = await this.invoices.findAll(filter, page);
    const patients = await this.patients.findByIds(
      invoices.map((i) => i.patientId),
    );
    const byId = new Map(patients.map((p) => [p.id, p]));

    return invoices.map((invoice) => ({
      invoice,
      patientName:
        byId.get(invoice.patientId)?.fullName ?? 'Paciente desconhecido',
      patientBirthDate: byId.get(invoice.patientId)?.birthDate ?? null,
    }));
  }
}
