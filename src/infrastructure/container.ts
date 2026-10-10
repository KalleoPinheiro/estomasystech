import {
  type CalendarGateway,
  LazyCalendarGateway,
  NullCalendarGateway,
} from '@/application/ports/calendar-gateway';
import type { ClinicProvisioning } from '@/application/ports/clinic-provisioning';
import {
  type EmailGateway,
  LazyEmailGateway,
  NullEmailGateway,
} from '@/application/ports/email-gateway';
import {
  type MessagingGateway,
  NullMessagingGateway,
} from '@/application/ports/messaging-gateway';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import type { TransactionManager } from '@/application/ports/transaction-manager';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { AuthTokenRepository } from '@/domain/auth/auth-token';
import type { MfaRepository } from '@/domain/auth/mfa';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { ProducedSessionRepository } from '@/domain/billing/commission';
import type { CommissionPayoutRepository } from '@/domain/billing/commission-payout';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import type { SessionPackageRepository } from '@/domain/billing/package';
import type { ProcedureKitRepository } from '@/domain/catalog/procedure-kit';
import type { ProcedureRepository } from '@/domain/catalog/procedure-repository';
import {
  ChannelSecretUnreadableError,
  type ClinicChannelRepository,
} from '@/domain/clinic/clinic-channel';
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
import type { ScheduleAvailabilityRepository } from '@/domain/scheduling/schedule-availability';
import type { ScheduleConfigRepository } from '@/domain/scheduling/schedule-config';
import type { WaitlistRepository } from '@/domain/scheduling/waitlist';
import type {
  NursingDiagnosisRepository,
  NursingInterventionRepository,
  NursingOutcomeRepository,
  TaxonomyLinkageRepository,
} from '@/domain/taxonomy/taxonomy-repositories';
import { googleCalendarOAuthConfigFromEnv } from '@/lib/auth/google-calendar-oauth';
import type { TenantScope } from '@/lib/auth/tenant-scope';
import { type DataCipher, dataCipherFromEnv } from '@/lib/data-cipher';
import { logError } from '@/lib/log-error';
import {
  GoogleCalendarGateway,
  googleCalendarConfigFromEnv,
} from './calendar/google-calendar-gateway';
import {
  EMAIL_PROVIDER_GATEWAYS,
  platformEmailGateway,
} from './email/resend-email-gateway';
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
import { DrizzleClinicChannelRepository } from './persistence/drizzle/drizzle-clinic-channel-repository';
import { DrizzleClinicProvisioning } from './persistence/drizzle/drizzle-clinic-provisioning';
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
import { DrizzleMfaRepository } from './persistence/drizzle/drizzle-mfa-repository';
import { DrizzleSessionPackageRepository } from './persistence/drizzle/drizzle-package-repository';
import { DrizzlePartnerRepository } from './persistence/drizzle/drizzle-partner-repository';
import { DrizzlePatientRepository } from './persistence/drizzle/drizzle-patient-repository';
import { DrizzleProducedSessionRepository } from './persistence/drizzle/drizzle-produced-session-repository';
import { DrizzleProfessionalRepository } from './persistence/drizzle/drizzle-professional-repository';
import { DrizzleReminderLogRepository } from './persistence/drizzle/drizzle-reminder-log-repository';
import { DrizzleScheduleAvailabilityRepository } from './persistence/drizzle/drizzle-schedule-availability-repository';
import {
  DrizzleNursingDiagnosisRepository,
  DrizzleNursingInterventionRepository,
  DrizzleNursingOutcomeRepository,
  DrizzleTaxonomyLinkageRepository,
} from './persistence/drizzle/drizzle-taxonomy-repositories';
import { DrizzleTransactionManager } from './persistence/drizzle/drizzle-transaction-manager';
import { DrizzleWaitlistRepository } from './persistence/drizzle/drizzle-waitlist-repository';
import { LEGACY_CLINIC_ID } from './persistence/drizzle/legacy-clinic';
import { DrizzleProfessionalPatientLinkRepository } from './persistence/drizzle/professional-patient-link-repository';
import { LocalPhotoStorage } from './storage/local-photo-storage';
import {
  createS3Client,
  S3PhotoStorage,
  type S3Sender,
  s3PhotoStorageConfigFromEnv,
} from './storage/s3-photo-storage';
import {
  isVercelRuntime,
  UnavailablePhotoStorage,
  VERCEL_REQUIRES_S3_MESSAGE,
} from './storage/unavailable-photo-storage';

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
  mfa: MfaRepository;
  scheduleConfig: ScheduleConfigRepository;
  scheduleAvailability: ScheduleAvailabilityRepository;
  waitlist: WaitlistRepository;
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
  /** Canal da clínica do escopo (ADR-011); lança no escopo de sistema. */
  clinicChannels: ClinicChannelRepository;
  /** E-mail do escopo: canal da clínica, ou o da plataforma sem clínica. */
  email: EmailGateway;
  transactions: TransactionManager;
  /** Criação de clínica + primeiro admin numa transação (B4). */
  clinicProvisioning: ClinicProvisioning;
}

const globalForServices = globalThis as unknown as {
  // hazard: chave por clínica (não uma entrada única) — cache global sem essa
  // chave reaproveitava a credencial OAuth de uma empresa em outra (issue #74).
  vittaCalendar?: Map<string, { key: string; gateway: CalendarGateway }>;
  vittaS3?: S3Sender;
  vittaCipher?: { key: string; cipher: DataCipher };
};

/**
 * Chaveiro do dado clínico (#195, ADR-006), um por processo. Refeito só se o
 * ambiente mudar (testes trocam as variáveis entre casos).
 */
export function currentDataCipher(): DataCipher {
  const env = process.env;
  const key = [
    env.NODE_ENV,
    env.DATA_ENCRYPTION_KEY,
    env.DATA_ENCRYPTION_KEY_PREVIOUS,
    env.AUTH_SECRET,
  ].join('\u0000');
  if (globalForServices.vittaCipher?.key !== key) {
    globalForServices.vittaCipher = { key, cipher: dataCipherFromEnv() };
  }
  return globalForServices.vittaCipher.cipher;
}

async function oauthCalendarGateway(
  db: AppDb,
  clinicId: string | null,
): Promise<{ key: string; gateway: CalendarGateway } | null> {
  const oauthConfig = googleCalendarOAuthConfigFromEnv();
  if (!oauthConfig) {
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
    // Chave de dados (#195); token gravado antes dela é lido pelo legado.
    const refreshToken = currentDataCipher().decrypt(
      account.encryptedRefreshToken,
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
    logError('Google Calendar: falha ao decifrar credencial OAuth', error);
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

/**
 * Canal de e-mail da clínica, lido do banco no primeiro uso (ADR-011). Sem
 * canal — ou com a chave que não decifra — a clínica não envia: o gateway é o
 * nulo, nunca o da plataforma. Sem cache entre requests: cada escopo resolve a
 * própria credencial (a reincidência da issue #74 fica impossível).
 */
async function clinicEmailGateway(
  channels: ClinicChannelRepository,
  clinicId: string,
): Promise<EmailGateway> {
  let channel: Awaited<ReturnType<ClinicChannelRepository['find']>>;
  try {
    channel = await channels.find('email');
  } catch (error) {
    if (!(error instanceof ChannelSecretUnreadableError)) {
      throw error;
    }
    // A mensagem do erro só leva a clínica: nem a chave nem o texto cifrado.
    logError(`E-mail da clínica ${clinicId}: canal desativado`, error);
    return new NullEmailGateway();
  }
  if (!channel) {
    return new NullEmailGateway();
  }
  return EMAIL_PROVIDER_GATEWAYS[channel.provider]({
    apiKey: channel.apiKey,
    from: channel.sender,
  });
}

function emailGatewayFor(
  channels: ClinicChannelRepository,
  clinicId: string | null,
): EmailGateway {
  if (clinicId === null) {
    return platformEmailGateway();
  }
  return new LazyEmailGateway(() => clinicEmailGateway(channels, clinicId));
}

/**
 * `PHOTO_STORAGE=s3` → bucket S3-compatível, compartilhado entre réplicas;
 * senão, disco local (volume Docker). Um `S3Client` por processo. Na Vercel,
 * sem bucket, nenhum disco serve: a foto sumiria com a instância (#206).
 */
export function buildPhotoStorage(clinicId: string): PhotoStorage {
  const config = s3PhotoStorageConfigFromEnv();
  if (!config && isVercelRuntime()) {
    return new UnavailablePhotoStorage(VERCEL_REQUIRES_S3_MESSAGE);
  }
  if (!config) {
    return new LocalPhotoStorage(undefined, clinicId);
  }
  globalForServices.vittaS3 ??= createS3Client(config);
  return new S3PhotoStorage(
    globalForServices.vittaS3,
    config.bucket,
    clinicId,
    config.serverSideEncryption,
  );
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
  // Sem chave de dados (produção) ou sem AUTH_SECRET (dev), lança aqui:
  // repositório clínico nunca grava em claro.
  const cipher = currentDataCipher();
  const clinicChannels = new DrizzleClinicChannelRepository(
    db,
    tenant.clinicId,
    cipher,
  );
  return {
    clinics: new DrizzleClinicRepository(db),
    patients: new DrizzlePatientRepository(db, tenant.clinicId, cipher),
    partners: new DrizzlePartnerRepository(db, tenant.clinicId),
    professionals: new DrizzleProfessionalRepository(db, tenant.clinicId),
    procedures: new DrizzleProcedureRepository(db, tenant.clinicId),
    procedureKits: new DrizzleProcedureKitRepository(db),
    sessionPackages: new DrizzleSessionPackageRepository(db, tenant.clinicId),
    userAccounts: new DrizzleUserAccountRepository(db, tenant.clinicId),
    authTokens: new DrizzleAuthTokenRepository(db),
    mfa: new DrizzleMfaRepository(db, cipher),
    scheduleConfig: new DrizzleScheduleConfigRepository(db, tenant.clinicId),
    scheduleAvailability: new DrizzleScheduleAvailabilityRepository(
      db,
      tenant.clinicId,
    ),
    waitlist: new DrizzleWaitlistRepository(db, tenant.clinicId, cipher),
    googleAccounts: new DrizzleGoogleAccountRepository(db, tenant.clinicId),
    appointments: new DrizzleAppointmentRepository(db, tenant.clinicId, cipher),
    invoices: new DrizzleInvoiceRepository(db, tenant.clinicId),
    producedSessions: new DrizzleProducedSessionRepository(db, tenant.clinicId),
    commissionPayouts: new DrizzleCommissionPayoutRepository(
      db,
      tenant.clinicId,
    ),
    anamneses: new DrizzleAnamnesisRepository(db, tenant.clinicId, cipher),
    evolutions: new DrizzleEvolutionNoteRepository(db, tenant.clinicId, cipher),
    conditions: new DrizzleClinicalConditionRepository(
      db,
      tenant.clinicId,
      cipher,
    ),
    assessments: new DrizzleConditionAssessmentRepository(
      db,
      tenant.clinicId,
      cipher,
    ),
    conditionPhotos: new DrizzleConditionPhotoRepository(
      db,
      tenant.clinicId,
      cipher,
    ),
    consentRecords: new DrizzleConsentRecordRepository(db, tenant.clinicId),
    nursingDiagnoses: new DrizzleNursingDiagnosisRepository(db),
    nursingOutcomes: new DrizzleNursingOutcomeRepository(db),
    nursingInterventions: new DrizzleNursingInterventionRepository(db),
    taxonomyLinkages: new DrizzleTaxonomyLinkageRepository(db),
    carePlans: new DrizzleCarePlanRepository(db, tenant.clinicId),
    carePlanDiagnoses: new DrizzleCarePlanDiagnosisRepository(
      db,
      tenant.clinicId,
      cipher,
    ),
    carePlanOutcomes: new DrizzleCarePlanOutcomeRepository(db, tenant.clinicId),
    carePlanInterventions: new DrizzleCarePlanInterventionRepository(
      db,
      tenant.clinicId,
    ),
    outcomeEvaluations: new DrizzleOutcomeEvaluationRepository(
      db,
      tenant.clinicId,
      cipher,
    ),
    interventionRecords: new DrizzleInterventionRecordRepository(
      db,
      tenant.clinicId,
      cipher,
    ),
    photoStorage: buildPhotoStorage(tenant.clinicId ?? LEGACY_CLINIC_ID),
    supplies: new DrizzleSupplyRepository(db, tenant.clinicId),
    stockMovements: new DrizzleStockMovementRepository(db, tenant.clinicId),
    supplyBatches: new DrizzleSupplyBatchRepository(db, tenant.clinicId),
    followUps: new DrizzleFollowUpRepository(db, tenant.clinicId),
    professionalPatientLinks: new DrizzleProfessionalPatientLinkRepository(
      db,
      tenant.clinicId,
    ),
    auditEvents: new DrizzleAuditEventRepository(db, tenant.clinicId),
    reminderLog: new DrizzleReminderLogRepository(db, tenant.clinicId),
    calendar: calendarGatewayFor(db, tenant.clinicId),
    messaging: buildMessagingGateway(),
    clinicChannels,
    email: emailGatewayFor(clinicChannels, tenant.clinicId),
    transactions: new DrizzleTransactionManager(db, tenant.clinicId, cipher),
    clinicProvisioning: new DrizzleClinicProvisioning(db),
  };
}
