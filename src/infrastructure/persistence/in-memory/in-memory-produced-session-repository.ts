import type {
  BillingRef,
  ProducedSession,
  ProducedSessionRepository,
} from '@/domain/billing/commission';
import type { Invoice } from '@/domain/billing/invoice';
import type { InMemoryAppointmentRepository } from './in-memory-appointment-repository';
import type { InMemoryInvoiceRepository } from './in-memory-invoice-repository';
import type { InMemorySessionPackageRepository } from './in-memory-package-repository';

const toBillingRef = (
  invoice: Invoice | null | undefined,
): BillingRef | null =>
  invoice
    ? {
        status: invoice.status,
        issuedAt: invoice.issuedAt,
        dueDate: invoice.dueDate,
      }
    : null;

/** Espelho em memória da leitura de produção (mesma forma do Drizzle). */
export class InMemoryProducedSessionRepository
  implements ProducedSessionRepository
{
  constructor(
    private readonly appointments: InMemoryAppointmentRepository,
    private readonly invoices: InMemoryInvoiceRepository,
    private readonly packages: InMemorySessionPackageRepository,
  ) {}

  async findCompletedInRange(
    start: Date,
    end: Date,
  ): Promise<ProducedSession[]> {
    const completed = (await this.appointments.findInRange(start, end)).filter(
      (a) => a.status === 'completed',
    );
    const invoices = this.invoices.all();
    return completed.map((appointment) => {
      const pkg = this.packages.consumedBy(appointment.id);
      return {
        appointmentId: appointment.id,
        professionalId: appointment.professionalId,
        procedure: appointment.procedure,
        listPriceCents: appointment.price.cents,
        invoice: toBillingRef(
          invoices.find((i) => i.appointmentId === appointment.id),
        ),
        package: pkg
          ? {
              priceCents: pkg.priceCents,
              totalSessions: pkg.totalSessions,
              invoice: toBillingRef(
                invoices.find((i) => i.sessionPackageId === pkg.id),
              ),
            }
          : null,
      };
    });
  }
}
