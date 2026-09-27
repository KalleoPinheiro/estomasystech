import type {
  TransactionManager,
  TransactionScope,
} from '@/application/ports/transaction-manager';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { DrizzleAppointmentRepository } from './drizzle-appointment-repository';
import { DrizzleFollowUpRepository } from './drizzle-inventory-repositories';
import { DrizzleInvoiceRepository } from './drizzle-invoice-repository';
import { DrizzleSessionPackageRepository } from './drizzle-package-repository';

/**
 * Unidade de trabalho sobre `db.transaction` do Drizzle: os repositórios do
 * escopo são reconstruídos sobre o `tx`, então qualquer erro dentro de `fn`
 * desfaz tudo (rollback) — CONS2-01.
 */
export class DrizzleTransactionManager implements TransactionManager {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  run<T>(fn: (repos: TransactionScope) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) =>
      fn({
        appointments: new DrizzleAppointmentRepository(
          tx,
          this.clinicId,
          this.cipher,
        ),
        invoices: new DrizzleInvoiceRepository(tx, this.clinicId),
        followUps: new DrizzleFollowUpRepository(tx, this.clinicId),
        sessionPackages: new DrizzleSessionPackageRepository(tx, this.clinicId),
      }),
    );
  }
}
