import type {
  TransactionManager,
  TransactionScope,
} from '@/application/ports/transaction-manager';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { DrizzleAppointmentRepository } from './drizzle-appointment-repository';
import { DrizzleAuditEventRepository } from './drizzle-audit-event-repository';
import { DrizzleClinicRepository } from './drizzle-clinic-repository';
import {
  DrizzleClinicalConditionRepository,
  DrizzleConditionPhotoRepository,
  DrizzleConsentRecordRepository,
} from './drizzle-clinical-repositories';
import { DrizzleCommissionPayoutRepository } from './drizzle-commission-payout-repository';
import { DrizzleDataSubjectRequestRepository } from './drizzle-data-subject-request-repository';
import {
  DrizzleProcedureRepository,
  DrizzleScheduleConfigRepository,
  DrizzleUserAccountRepository,
} from './drizzle-foundation-repositories';
import { DrizzleGuardianRepository } from './drizzle-guardian-repository';
import { DrizzleFollowUpRepository } from './drizzle-inventory-repositories';
import { DrizzleInvoiceRepository } from './drizzle-invoice-repository';
import { DrizzleSessionPackageRepository } from './drizzle-package-repository';
import { DrizzlePartnerRepository } from './drizzle-partner-repository';
import { DrizzlePartnerShareConsentRepository } from './drizzle-partner-share-consent-repository';
import { DrizzlePatientRepository } from './drizzle-patient-repository';
import { DrizzleProducedSessionRepository } from './drizzle-produced-session-repository';
import { DrizzleProfessionalRepository } from './drizzle-professional-repository';
import { DrizzleScheduleAvailabilityRepository } from './drizzle-schedule-availability-repository';
import { DrizzleProfessionalPatientLinkRepository } from './professional-patient-link-repository';

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
        invoices: new DrizzleInvoiceRepository(tx, this.clinicId, this.cipher),
        followUps: new DrizzleFollowUpRepository(tx, this.clinicId),
        sessionPackages: new DrizzleSessionPackageRepository(tx, this.clinicId),
        userAccounts: new DrizzleUserAccountRepository(tx, this.clinicId),
        auditEvents: new DrizzleAuditEventRepository(tx, this.clinicId),
        patients: new DrizzlePatientRepository(tx, this.clinicId, this.cipher),
        scheduleConfig: new DrizzleScheduleConfigRepository(tx, this.clinicId),
        scheduleAvailability: new DrizzleScheduleAvailabilityRepository(
          tx,
          this.clinicId,
        ),
        conditions: new DrizzleClinicalConditionRepository(
          tx,
          this.clinicId,
          this.cipher,
        ),
        conditionPhotos: new DrizzleConditionPhotoRepository(
          tx,
          this.clinicId,
          this.cipher,
        ),
        procedures: new DrizzleProcedureRepository(tx, this.clinicId),
        professionals: new DrizzleProfessionalRepository(tx, this.clinicId),
        producedSessions: new DrizzleProducedSessionRepository(
          tx,
          this.clinicId,
        ),
        commissionPayouts: new DrizzleCommissionPayoutRepository(
          tx,
          this.clinicId,
        ),
        partners: new DrizzlePartnerRepository(tx, this.clinicId),
        guardians: new DrizzleGuardianRepository(tx, this.clinicId),
        professionalPatientLinks: new DrizzleProfessionalPatientLinkRepository(
          tx,
          this.clinicId,
        ),
        consentRecords: new DrizzleConsentRecordRepository(tx, this.clinicId),
        partnerShareConsents: new DrizzlePartnerShareConsentRepository(
          tx,
          this.clinicId,
        ),
        dataSubjectRequests: new DrizzleDataSubjectRequestRepository(
          tx,
          this.clinicId,
          this.cipher,
        ),
        clinics: new DrizzleClinicRepository(tx),
      }),
    );
  }
}
