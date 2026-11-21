import { sql } from 'drizzle-orm';
import type {
  TransactionManager,
  TransactionScope,
} from '@/application/ports/transaction-manager';
import { blindIndexFromEnv } from '@/lib/blind-index';
import type { FieldCipher } from '@/lib/data-cipher';
import { CLINIC_SETTING } from './clinic-scoped-pool';
import type { AppDb } from './db';
import { DrizzleAppointmentRepository } from './drizzle-appointment-repository';
import { DrizzleAuditEventRepository } from './drizzle-audit-event-repository';
import {
  DrizzleCarePlanDiagnosisRepository,
  DrizzleCarePlanInterventionRepository,
  DrizzleCarePlanOutcomeRepository,
  DrizzleCarePlanRepository,
  DrizzleInterventionRecordRepository,
  DrizzleOutcomeEvaluationRepository,
} from './drizzle-care-plan-repositories';
import { DrizzleClinicRepository } from './drizzle-clinic-repository';
import {
  DrizzleAnamnesisRepository,
  DrizzleClinicalConditionRepository,
  DrizzleConditionAssessmentRepository,
  DrizzleConditionPhotoRepository,
  DrizzleConsentRecordRepository,
  DrizzleEvolutionNoteRepository,
} from './drizzle-clinical-repositories';
import { DrizzleCommissionPayoutRepository } from './drizzle-commission-payout-repository';
import { DrizzleDataSubjectRequestRepository } from './drizzle-data-subject-request-repository';
import {
  DrizzleProcedureKitRepository,
  DrizzleProcedureRepository,
  DrizzleScheduleConfigRepository,
  DrizzleUserAccountRepository,
} from './drizzle-foundation-repositories';
import { DrizzleGuardianRepository } from './drizzle-guardian-repository';
import {
  DrizzleFollowUpRepository,
  DrizzleStockMovementRepository,
  DrizzleSupplyBatchRepository,
  DrizzleSupplyRepository,
} from './drizzle-inventory-repositories';
import { DrizzleInvoiceRepository } from './drizzle-invoice-repository';
import { DrizzleSessionPackageRepository } from './drizzle-package-repository';
import { DrizzlePartnerRepository } from './drizzle-partner-repository';
import { DrizzlePartnerShareConsentRepository } from './drizzle-partner-share-consent-repository';
import {
  type BlindIndexSource,
  DrizzlePatientRepository,
} from './drizzle-patient-repository';
import { DrizzleClinicNursingDiagnosisRepository } from './drizzle-clinic-diagnosis-repository';
import { DrizzleProducedSessionRepository } from './drizzle-produced-session-repository';
import { DrizzleProfessionalRepository } from './drizzle-professional-repository';
import { DrizzleScheduleAvailabilityRepository } from './drizzle-schedule-availability-repository';
import {
  DrizzleNursingDiagnosisRepository,
  DrizzleNursingInterventionRepository,
  DrizzleNursingOutcomeRepository,
} from './drizzle-taxonomy-repositories';
import { DrizzleWaitlistRepository } from './drizzle-waitlist-repository';
import { DrizzleProfessionalPatientLinkRepository } from './professional-patient-link-repository';

type Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

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
    private readonly blindIndex: BlindIndexSource = blindIndexFromEnv,
  ) {}

  run<T>(fn: (repos: TransactionScope) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      // RLS etapa 2 (ADR-110): a clínica vale só nesta transação (`true` = local), então não vaza
      // pelo pool. Escopo de sistema (clínica nula) usa o papel BYPASSRLS e não grava nada.
      if (this.clinicId !== null) {
        await tx.execute(
          sql`select set_config(${CLINIC_SETTING}, ${this.clinicId}, true)`,
        );
      }
      return fn(this.repositories(tx));
    });
  }

  private repositories(tx: Tx): TransactionScope {
    return {
      appointments: new DrizzleAppointmentRepository(
        tx,
        this.clinicId,
        this.cipher,
      ),
      invoices: new DrizzleInvoiceRepository(tx, this.clinicId, this.cipher),
      followUps: new DrizzleFollowUpRepository(tx, this.clinicId),
      sessionPackages: new DrizzleSessionPackageRepository(tx, this.clinicId),
      userAccounts: new DrizzleUserAccountRepository(
        tx,
        this.clinicId,
        this.cipher,
        this.blindIndex,
      ),
      auditEvents: new DrizzleAuditEventRepository(tx, this.clinicId),
      patients: new DrizzlePatientRepository(
        tx,
        this.clinicId,
        this.cipher,
        this.blindIndex,
      ),
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
      producedSessions: new DrizzleProducedSessionRepository(tx, this.clinicId),
      commissionPayouts: new DrizzleCommissionPayoutRepository(
        tx,
        this.clinicId,
      ),
      partners: new DrizzlePartnerRepository(tx, this.clinicId),
      guardians: new DrizzleGuardianRepository(
        tx,
        this.clinicId,
        this.cipher,
        this.blindIndex,
      ),
      professionalPatientLinks: new DrizzleProfessionalPatientLinkRepository(
        tx,
        this.clinicId,
      ),
      anamneses: new DrizzleAnamnesisRepository(tx, this.clinicId, this.cipher),
      evolutions: new DrizzleEvolutionNoteRepository(
        tx,
        this.clinicId,
        this.cipher,
      ),
      assessments: new DrizzleConditionAssessmentRepository(
        tx,
        this.clinicId,
        this.cipher,
      ),
      partnerShareConsents: new DrizzlePartnerShareConsentRepository(
        tx,
        this.clinicId,
      ),
      carePlans: new DrizzleCarePlanRepository(tx, this.clinicId),
      carePlanDiagnoses: new DrizzleCarePlanDiagnosisRepository(
        tx,
        this.clinicId,
        this.cipher,
      ),
      carePlanOutcomes: new DrizzleCarePlanOutcomeRepository(tx, this.clinicId),
      carePlanInterventions: new DrizzleCarePlanInterventionRepository(
        tx,
        this.clinicId,
      ),
      outcomeEvaluations: new DrizzleOutcomeEvaluationRepository(
        tx,
        this.clinicId,
        this.cipher,
      ),
      interventionRecords: new DrizzleInterventionRecordRepository(
        tx,
        this.clinicId,
        this.cipher,
      ),
      nursingDiagnoses: new DrizzleNursingDiagnosisRepository(tx),
      clinicNursingDiagnoses: new DrizzleClinicNursingDiagnosisRepository(
        tx,
        this.clinicId,
      ),
      nursingOutcomes: new DrizzleNursingOutcomeRepository(tx),
      nursingInterventions: new DrizzleNursingInterventionRepository(tx),
      consentRecords: new DrizzleConsentRecordRepository(tx, this.clinicId),
      dataSubjectRequests: new DrizzleDataSubjectRequestRepository(
        tx,
        this.clinicId,
        this.cipher,
      ),
      clinics: new DrizzleClinicRepository(tx),
      waitlist: new DrizzleWaitlistRepository(tx, this.clinicId, this.cipher),
      procedureKits: new DrizzleProcedureKitRepository(tx),
      supplies: new DrizzleSupplyRepository(tx, this.clinicId),
      stockMovements: new DrizzleStockMovementRepository(tx, this.clinicId),
      supplyBatches: new DrizzleSupplyBatchRepository(tx, this.clinicId),
    };
  }
}
