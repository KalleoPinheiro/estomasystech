import {
  type CalendarGateway,
  LazyCalendarGateway,
  NullCalendarGateway,
} from '@/application/ports/calendar-gateway';
import type { EmailGateway } from '@/application/ports/email-gateway';
import {
  type MessagingGateway,
  NullMessagingGateway,
} from '@/application/ports/messaging-gateway';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import type { TransactionManager } from '@/application/ports/transaction-manager';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { AuthTokenRepository } from '@/domain/auth/auth-token';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { ProducedSessionRepository } from '@/domain/billing/commission';
import type { CommissionPayoutRepository } from '@/domain/billing/commission-payout';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import type { SessionPackageRepository } from '@/domain/billing/package';
import type { ProcedureKitRepository } from '@/domain/catalog/procedure-kit';
import type { ProcedureRepository } from '@/domain/catalog/procedure-repository';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import type {
  AnamnesisRepository,
  CarePlanDiagnosisRepository,
  CarePlanInterventionRepository,
  CarePlanOutcomeRepository,
  CarePlanRepository,
  ClinicalConditionRepository,
  ConditionAssessmentRepository,
  ConditionPhotoRepository,
  EvolutionNoteRepository,
  InterventionRecordRepository,
  OutcomeEvaluationRepository,
} from '@/domain/clinical/clinical-repositories';
import type { ProfessionalPatientLinkRepository } from '@/domain/clinical/professional-patient-link';
import type { ConsentRecordRepository } from '@/domain/consent/consent-record';
import type { FollowUpRepository } from '@/domain/followup/follow-up-repository';
import type {
  StockMovementRepository,
  SupplyBatchRepository,
  SupplyRepository,
} from '@/domain/inventory/inventory-repositories';
import type { ReminderLogRepository } from '@/domain/messaging/reminder-log';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { ProfessionalRepository } from '@/domain/professional/professional-repository';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import type { ScheduleConfigRepository } from '@/domain/scheduling/schedule-config';
import type {
  NursingDiagnosisRepository,
  NursingInterventionRepository,
  NursingOutcomeRepository,
  TaxonomyLinkageRepository,
} from '@/domain/taxonomy/taxonomy-repositories';
import { decryptSecret } from '@/lib/auth/crypto';
import { googleCalendarOAuthConfigFromEnv } from '@/lib/auth/google-calendar-oauth';
import { getAuthConfig } from '@/lib/auth/session';
import type { TenantScope } from '@/lib/auth/tenant-scope';
import {
  GoogleCalendarGateway,
  googleCalendarConfigFromEnv,
} from './calendar/google-calendar-gateway';
import { buildEmailGateway } from './email/resend-email-gateway';
import {
  MetaWhatsAppGateway,
  metaWhatsAppConfigFromEnv,
} from './messaging/meta-whatsapp-gateway';
import type { AppDb } from './persistence/drizzle/db';
import { getDb } from './persistence/drizzle/db';
import { DrizzleAppointmentRepository } from './persistence/drizzle/drizzle-appointment-repository';
import { DrizzleAuditEventRepository } from './persistence/drizzle/drizzle-audit-event-repository';
import { DrizzleAuthTokenRepository } from './persistence/drizzle/drizzle-auth-token-repository';
import {
  DrizzleCarePlanDiagnosisRepository,
  DrizzleCarePlanInterventionRepository,
  DrizzleCarePlanOutcomeRepository,
  DrizzleCarePlanRepository,
  DrizzleInterventionRecordRepository,
  DrizzleOutcomeEvaluationRepository,
} from './persistence/drizzle/drizzle-care-plan-repositories';
import { DrizzleClinicRepository } from './persistence/drizzle/drizzle-clinic-repository';
import {
  DrizzleAnamnesisRepository,
  DrizzleClinicalConditionRepository,
  DrizzleConditionAssessmentRepository,
  DrizzleConditionPhotoRepository,
  DrizzleConsentRecordRepository,
  DrizzleEvolutionNoteRepository,
} from './persistence/drizzle/drizzle-clinical-repositories';
import { DrizzleCommissionPayoutRepository } from './persistence/drizzle/drizzle-commission-payout-repository';
import {
  DrizzleProcedureKitRepository,
  DrizzleProcedureRepository,
  DrizzleScheduleConfigRepository,
  DrizzleUserAccountRepository,
} from './persistence/drizzle/drizzle-foundation-repositories';
import { DrizzleGoogleAccountRepository } from './persistence/drizzle/drizzle-google-account-repository';
import {
  DrizzleFollowUpRepository,
  DrizzleStockMovementRepository,
  DrizzleSupplyBatchRepository,
  DrizzleSupplyRepository,
} from './persistence/drizzle/drizzle-inventory-repositories';
import { DrizzleInvoiceRepository } from './persistence/drizzle/drizzle-invoice-repository';
import { DrizzleSessionPackageRepository } from './persistence/drizzle/drizzle-package-repository';
import { DrizzlePartnerRepository } from './persistence/drizzle/drizzle-partner-repository';
import { DrizzlePatientRepository } from './persistence/drizzle/drizzle-patient-repository';
import { DrizzleProducedSessionRepository } from './persistence/drizzle/drizzle-produced-session-repository';
import { DrizzleProfessionalRepository } from './persistence/drizzle/drizzle-professional-repository';
import { DrizzleReminderLogRepository } from './persistence/drizzle/drizzle-reminder-log-repository';
import {
  DrizzleNursingDiagnosisRepository,
  DrizzleNursingInterventionRepository,
  DrizzleNursingOutcomeRepository,
  DrizzleTaxonomyLinkageRepository,
} from './persistence/drizzle/drizzle-taxonomy-repositories';
import { DrizzleTransactionManager } from './persistence/drizzle/drizzle-transaction-manager';
import { LEGACY_CLINIC_ID } from './persistence/drizzle/legacy-clinic';
import { DrizzleProfessionalPatientLinkRepository } from './persistence/drizzle/professional-patient-link-repository';
import { LocalPhotoStorage } from './storage/local-photo-storage';

export interface Services {
  clinics: ClinicRepository;
  patients: PatientRepository;
  partners: PartnerRepository;
  professionals: ProfessionalRepository;
  procedures: ProcedureRepository;
  procedureKits: ProcedureKitRepository;
  sessionPackages: SessionPackageRepository;
  userAccounts: UserAccountRepository;
  authTokens: AuthTokenRepository;
  scheduleConfig: ScheduleConfigRepository;
  googleAccounts: DrizzleGoogleAccountRepository;
  appointments: AppointmentRepository;
  invoices: InvoiceRepository;
  producedSessions: ProducedSessionRepository;
  commissionPayouts: CommissionPayoutRepository;
  anamneses: AnamnesisRepository;
  evolutions: EvolutionNoteRepository;
  conditions: ClinicalConditionRepository;
  assessments: ConditionAssessmentRepository;
  conditionPhotos: ConditionPhotoRepository;
  consentRecords: ConsentRecordRepository;
  nursingDiagnoses: NursingDiagnosisRepository;
  nursingOutcomes: NursingOutcomeRepository;
  nursingInterventions: NursingInterventionRepository;
  taxonomyLinkages: TaxonomyLinkageRepository;
  carePlans: CarePlanRepository;
  carePlanDiagnoses: CarePlanDiagnosisRepository;
  carePlanOutcomes: CarePlanOutcomeRepository;
  carePlanInterventions: CarePlanInterventionRepository;
  outcomeEvaluations: OutcomeEvaluationRepository;
  interventionRecords: InterventionRecordRepository;
  photoStorage: PhotoStorage;
  supplies: SupplyRepository;
  stockMovements: StockMovementRepository;
  supplyBatches: SupplyBatchRepository;
  followUps: FollowUpRepository;
  professionalPatientLinks: ProfessionalPatientLinkRepository;
  auditEvents: AuditEventRepository;
  reminderLog: ReminderLogRepository;
  calendar: CalendarGateway;
  messaging: MessagingGateway;
  email: EmailGateway;
  transactions: TransactionManager;
}

const globalForServices = globalThis as unknown as {
  // hazard: chave por clínica (não uma entrada única) — cache global sem essa
  // chave reaproveitava a credencial OAuth de uma empresa em outra (issue #74).
  vittaCalendar?: Map<string, { key: string; gateway: CalendarGateway }>;
};

async function oauthCalendarGateway(
  db: AppDb,
  clinicId: string | null,
): Promise<{ key: string; gateway: CalendarGateway } | null> {
  const oauthConfig = googleCalendarOAuthConfigFromEnv();
  const auth = getAuthConfig();
  if (!oauthConfig || !auth) {
    return null;
  }
  const account = await new DrizzleGoogleAccountRepository(
    db,
    clinicId,
  ).findMostRecent();
  if (!account) {
    return null;
  }
  try {
    const refreshToken = decryptSecret(
      account.encryptedRefreshToken,
      auth.secret,
    );
    return {
      key: `oauth:${account.email}:${account.connectedAt.getTime()}`,
      gateway: GoogleCalendarGateway.withOAuth({
        clientId: oauthConfig.clientId,
        clientSecret: oauthConfig.clientSecret,
        refreshToken,
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      }),
    };
  } catch (error) {
    console.error('Google Calendar: falha ao decifrar credencial OAuth', error);
    return null;
  }
}

/**
 * Prioridade: conta Google logada (OAuth) → service account → desativado.
 * Cache por clínica (Map) para reaproveitar o access token do googleapis sem
 * vazar a credencial de uma empresa para outra (issue #74).
 */
async function buildCalendarGateway(
  db: AppDb,
  clinicId: string | null,
): Promise<CalendarGateway> {
  const oauth = await oauthCalendarGateway(db, clinicId);
  const serviceConfig = oauth ? null : googleCalendarConfigFromEnv();
  const next = oauth ?? {
    key: serviceConfig ? 'service-account' : 'null',
    gateway: serviceConfig
      ? GoogleCalendarGateway.withServiceAccount(serviceConfig)
      : new NullCalendarGateway(),
  };

  globalForServices.vittaCalendar ??= new Map();
  const cache = globalForServices.vittaCalendar;
  const cacheKey = clinicId ?? 'system';
  const cached = cache.get(cacheKey);
  if (cached?.key === next.key) {
    return cached.gateway;
  }
  cache.set(cacheKey, next);
  return next.gateway;
}

/**
 * Sem integração configurada no ambiente, o gateway é o nulo — sem tocar o
 * banco. Com integração, a credencial OAuth só é lida no primeiro uso: antes,
 * todo request (inclusive os que nunca usam a agenda) consultava
 * `google_accounts` ao montar os serviços.
 */
function calendarGatewayFor(
  db: AppDb,
  clinicId: string | null,
): CalendarGateway {
  if (!googleCalendarOAuthConfigFromEnv() && !googleCalendarConfigFromEnv()) {
    return new NullCalendarGateway();
  }
  return new LazyCalendarGateway(() => buildCalendarGateway(db, clinicId));
}

function buildMessagingGateway(): MessagingGateway {
  const config = metaWhatsAppConfigFromEnv();
  return config ? new MetaWhatsAppGateway(config) : new NullMessagingGateway();
}

/**
 * O escopo vem só das fábricas de `@/lib/auth/tenant-scope` (sessionScope,
 * writeScope, clinicScope, systemScope) — objeto literal não compila.
 */
export async function getRepositories(tenant: TenantScope): Promise<Services> {
  const db = await getDb();
  const auth = getAuthConfig();
  if (!auth) {
    throw new Error(
      'AUTH_SECRET ausente — repositórios clínicos cifrados exigem o segredo de autenticação',
    );
  }
  return {
    clinics: new DrizzleClinicRepository(db),
    patients: new DrizzlePatientRepository(db, tenant.clinicId),
    partners: new DrizzlePartnerRepository(db, tenant.clinicId),
    professionals: new DrizzleProfessionalRepository(db, tenant.clinicId),
    procedures: new DrizzleProcedureRepository(db, tenant.clinicId),
    procedureKits: new DrizzleProcedureKitRepository(db),
    sessionPackages: new DrizzleSessionPackageRepository(db, tenant.clinicId),
    userAccounts: new DrizzleUserAccountRepository(db, tenant.clinicId),
    authTokens: new DrizzleAuthTokenRepository(db),
    scheduleConfig: new DrizzleScheduleConfigRepository(db, tenant.clinicId),
    googleAccounts: new DrizzleGoogleAccountRepository(db, tenant.clinicId),
    appointments: new DrizzleAppointmentRepository(db, tenant.clinicId),
    invoices: new DrizzleInvoiceRepository(db, tenant.clinicId),
    producedSessions: new DrizzleProducedSessionRepository(db, tenant.clinicId),
    commissionPayouts: new DrizzleCommissionPayoutRepository(
      db,
      tenant.clinicId,
    ),
    anamneses: new DrizzleAnamnesisRepository(db, tenant.clinicId),
    evolutions: new DrizzleEvolutionNoteRepository(
      db,
      tenant.clinicId,
      auth.secret,
    ),
    conditions: new DrizzleClinicalConditionRepository(
      db,
      tenant.clinicId,
      auth.secret,
    ),
    assessments: new DrizzleConditionAssessmentRepository(
      db,
      tenant.clinicId,
      auth.secret,
    ),
    conditionPhotos: new DrizzleConditionPhotoRepository(db, tenant.clinicId),
    consentRecords: new DrizzleConsentRecordRepository(db, tenant.clinicId),
    nursingDiagnoses: new DrizzleNursingDiagnosisRepository(db),
    nursingOutcomes: new DrizzleNursingOutcomeRepository(db),
    nursingInterventions: new DrizzleNursingInterventionRepository(db),
    taxonomyLinkages: new DrizzleTaxonomyLinkageRepository(db),
    carePlans: new DrizzleCarePlanRepository(db, tenant.clinicId),
    carePlanDiagnoses: new DrizzleCarePlanDiagnosisRepository(
      db,
      tenant.clinicId,
    ),
    carePlanOutcomes: new DrizzleCarePlanOutcomeRepository(db, tenant.clinicId),
    carePlanInterventions: new DrizzleCarePlanInterventionRepository(
      db,
      tenant.clinicId,
    ),
    outcomeEvaluations: new DrizzleOutcomeEvaluationRepository(
      db,
      tenant.clinicId,
    ),
    interventionRecords: new DrizzleInterventionRecordRepository(
      db,
      tenant.clinicId,
    ),
    photoStorage: new LocalPhotoStorage(
      undefined,
      tenant.clinicId ?? LEGACY_CLINIC_ID,
    ),
    supplies: new DrizzleSupplyRepository(db, tenant.clinicId),
    stockMovements: new DrizzleStockMovementRepository(db, tenant.clinicId),
    supplyBatches: new DrizzleSupplyBatchRepository(db, tenant.clinicId),
    followUps: new DrizzleFollowUpRepository(db, tenant.clinicId),
    professionalPatientLinks: new DrizzleProfessionalPatientLinkRepository(
      db,
      tenant.clinicId,
    ),
    auditEvents: new DrizzleAuditEventRepository(db),
    reminderLog: new DrizzleReminderLogRepository(db, tenant.clinicId),
    calendar: calendarGatewayFor(db, tenant.clinicId),
    messaging: buildMessagingGateway(),
    email: buildEmailGateway(),
    transactions: new DrizzleTransactionManager(db, tenant.clinicId),
  };
}
