import {
  NoTransactionManager,
  type TransactionManager,
  type TransactionScope,
} from '@/application/ports/transaction-manager';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import {
  InMemoryClinicalConditionRepository,
  InMemoryConditionPhotoRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import { InMemoryCommissionPayoutRepository } from '@/infrastructure/persistence/in-memory/in-memory-commission-payout-repository';
import {
  InMemoryProcedureRepository,
  InMemoryScheduleAvailabilityRepository,
  InMemoryScheduleConfigRepository,
  InMemoryUserAccountRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryProducedSessionRepository } from '@/infrastructure/persistence/in-memory/in-memory-produced-session-repository';
import { InMemoryProfessionalRepository } from '@/infrastructure/persistence/in-memory/in-memory-professional-repository';

/** Escopo transacional em memória; o que o teste já tem entra por `parts`. */
export function inMemoryScope(
  parts: Partial<TransactionScope> = {},
): TransactionScope {
  const appointments =
    parts.appointments ?? new InMemoryAppointmentRepository();
  const invoices = parts.invoices ?? new InMemoryInvoiceRepository();
  const sessionPackages =
    parts.sessionPackages ?? new InMemorySessionPackageRepository();
  return {
    appointments,
    invoices,
    followUps: new InMemoryFollowUpRepository(),
    sessionPackages,
    userAccounts: new InMemoryUserAccountRepository(),
    auditEvents: new InMemoryAuditEventRepository(),
    patients: new InMemoryPatientRepository(),
    scheduleConfig: new InMemoryScheduleConfigRepository(),
    scheduleAvailability: new InMemoryScheduleAvailabilityRepository(),
    conditions: new InMemoryClinicalConditionRepository(),
    conditionPhotos: new InMemoryConditionPhotoRepository(),
    procedures: new InMemoryProcedureRepository(),
    professionals: new InMemoryProfessionalRepository(),
    producedSessions: new InMemoryProducedSessionRepository(
      appointments as InMemoryAppointmentRepository,
      invoices as InMemoryInvoiceRepository,
      sessionPackages as InMemorySessionPackageRepository,
    ),
    commissionPayouts: new InMemoryCommissionPayoutRepository(),
    ...parts,
  };
}

export const noTransaction = (parts: Partial<TransactionScope> = {}) =>
  new NoTransactionManager(inMemoryScope(parts));

/**
 * Imita o `SELECT … FOR UPDATE` do Postgres: `findByIdForUpdate` espera quem
 * já trancou o mesmo paciente e só libera quando a transação (`run`) termina.
 * Sem isso, o in-memory deixaria as chamadas concorrentes se intercalarem nos
 * `await` e o teste de concorrência provaria nada.
 */
export class RowLockingTransactionManager implements TransactionManager {
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly parts: Partial<TransactionScope> = {}) {}

  async run<T>(fn: (repos: TransactionScope) => Promise<T>): Promise<T> {
    const scope = inMemoryScope(this.parts);
    const releases: Array<() => void> = [];
    const base = scope.patients;
    const patients: PatientRepository = {
      save: (patient: Patient) => base.save(patient),
      findById: (id) => base.findById(id),
      findByIds: (ids) => base.findByIds(ids),
      findByReferrer: (id) => base.findByReferrer(id),
      findByGuardian: (id) => base.findByGuardian(id),
      findAdultsAwaitingMajorityReview: (ids, cutoff) =>
        base.findAdultsAwaitingMajorityReview(ids, cutoff),
      findAll: (search, page) => base.findAll(search, page),
      findClinicIdById: (id) => base.findClinicIdById(id),
      findByIdForUpdate: async (id) => {
        const previous = this.tails.get(id) ?? Promise.resolve();
        let release!: () => void;
        const mine = new Promise<void>((resolve) => {
          release = resolve;
        });
        this.tails.set(
          id,
          previous.then(() => mine),
        );
        releases.push(release);
        await previous;
        return base.findById(id);
      },
    };
    try {
      return await fn({ ...scope, patients });
    } finally {
      for (const release of releases) release();
    }
  }
}
