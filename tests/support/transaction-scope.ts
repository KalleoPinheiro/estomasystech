import {
  NoTransactionManager,
  type TransactionManager,
  type TransactionScope,
} from '@/application/ports/transaction-manager';
import type { ProfessionalPatientLinkRepository } from '@/domain/clinical/professional-patient-link';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import {
  InMemoryClinicalConditionRepository,
  InMemoryConditionPhotoRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import {
  InMemoryScheduleAvailabilityRepository,
  InMemoryScheduleConfigRepository,
  InMemoryUserAccountRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryPartnerRepository } from '@/infrastructure/persistence/in-memory/in-memory-partner-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

/** Vínculos Profissional↔Paciente em memória (só no escopo transacional dos testes). */
export class InMemoryProfessionalPatientLinks
  implements ProfessionalPatientLinkRepository
{
  private readonly links = new Set<string>();

  async ensureLink(professionalId: string, patientId: string): Promise<void> {
    this.links.add(`${professionalId}:${patientId}`);
  }

  async hasLink(professionalId: string, patientId: string): Promise<boolean> {
    return this.links.has(`${professionalId}:${patientId}`);
  }

  async findLinkedPatientIds(professionalId: string): Promise<string[]> {
    return [...this.links].flatMap((key) => {
      const [professional, patient] = key.split(':');
      return professional === professionalId ? [patient] : [];
    });
  }
}

/** Escopo transacional em memória; o que o teste já tem entra por `parts`. */
export function inMemoryScope(
  parts: Partial<TransactionScope> = {},
): TransactionScope {
  return {
    appointments: new InMemoryAppointmentRepository(),
    invoices: new InMemoryInvoiceRepository(),
    followUps: new InMemoryFollowUpRepository(),
    sessionPackages: new InMemorySessionPackageRepository(),
    userAccounts: new InMemoryUserAccountRepository(),
    auditEvents: new InMemoryAuditEventRepository(),
    patients: new InMemoryPatientRepository(),
    scheduleConfig: new InMemoryScheduleConfigRepository(),
    scheduleAvailability: new InMemoryScheduleAvailabilityRepository(),
    conditions: new InMemoryClinicalConditionRepository(),
    conditionPhotos: new InMemoryConditionPhotoRepository(),
    partners: new InMemoryPartnerRepository(),
    guardians: new InMemoryGuardianRepository(),
    professionalPatientLinks: new InMemoryProfessionalPatientLinks(),
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
