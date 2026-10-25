import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import type { SessionPackageRepository } from '@/domain/billing/package';
import type {
  ClinicalConditionRepository,
  ConditionPhotoRepository,
} from '@/domain/clinical/clinical-repositories';
import type { ProfessionalPatientLinkRepository } from '@/domain/clinical/professional-patient-link';
import type { FollowUpRepository } from '@/domain/followup/follow-up-repository';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import type { ScheduleAvailabilityRepository } from '@/domain/scheduling/schedule-availability';
import type { ScheduleConfigRepository } from '@/domain/scheduling/schedule-config';

/**
 * Repositórios disponíveis dentro de uma transação — escopo enxuto, apenas o
 * que a conclusão de consulta usa (YAGNI); cresce quando outro fluxo precisar.
 * `userAccounts`/`auditEvents` entraram pelo convite de admin da plataforma
 * (#243): a conta nova e o evento de auditoria gravam juntos ou nada grava.
 * `patients` (com `findByIdForUpdate`), agenda e fotos entraram com o teto
 * atômico do portal (#363): tudo que o fluxo lê dentro da transação precisa vir
 * do escopo — usar o repositório de fora trava o PGlite (conexão única).
 * `partners`, `guardians` e `professionalPatientLinks` entraram com o cadastro
 * de paciente como Server Action (#549): paciente, vínculo do Profissional e
 * auditoria gravam juntos ou nada grava.
 */
export interface TransactionScope {
  appointments: AppointmentRepository;
  invoices: InvoiceRepository;
  followUps: FollowUpRepository;
  sessionPackages: SessionPackageRepository;
  userAccounts: UserAccountRepository;
  auditEvents: AuditEventRepository;
  patients: PatientRepository;
  scheduleConfig: ScheduleConfigRepository;
  scheduleAvailability: ScheduleAvailabilityRepository;
  conditions: ClinicalConditionRepository;
  conditionPhotos: ConditionPhotoRepository;
  partners: PartnerRepository;
  guardians: GuardianRepository;
  professionalPatientLinks: ProfessionalPatientLinkRepository;
}

/**
 * Unidade de trabalho (P1 histórico do projeto): executa `fn` com repositórios
 * transacionais — tudo persiste ou nada persiste.
 */
export interface TransactionManager {
  run<T>(fn: (repos: TransactionScope) => Promise<T>): Promise<T>;
}

/**
 * Implementação sem transação real (in-memory/testes, CONS2-03): executa a
 * função com os repositórios existentes. Mantém os testes de unidade puros.
 */
export class NoTransactionManager implements TransactionManager {
  constructor(private readonly repos: TransactionScope) {}

  async run<T>(fn: (repos: TransactionScope) => Promise<T>): Promise<T> {
    return fn(this.repos);
  }
}
