import type { Invoice } from '@/domain/billing/invoice';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import type {
  SessionPackage,
  SessionPackageRepository,
} from '@/domain/billing/package';
import type { Anamnesis } from '@/domain/clinical/anamnesis';
import type { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import type {
  AnamnesisRepository,
  ClinicalConditionRepository,
  ConditionAssessmentRepository,
  ConditionPhotoRepository,
  EvolutionNoteRepository,
} from '@/domain/clinical/clinical-repositories';
import type { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import type { ConditionPhoto } from '@/domain/clinical/condition-photo';
import type { EvolutionNote } from '@/domain/clinical/evolution-note';
import type {
  ConsentRecord,
  ConsentRecordRepository,
} from '@/domain/consent/consent-record';
import type { Patient } from '@/domain/patient/patient';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';

export interface PatientDataExportRepos {
  anamneses: AnamnesisRepository;
  evolutions: EvolutionNoteRepository;
  conditions: ClinicalConditionRepository;
  assessments: ConditionAssessmentRepository;
  conditionPhotos: ConditionPhotoRepository;
  appointments: AppointmentRepository;
  invoices: InvoiceRepository;
  consentRecords: ConsentRecordRepository;
  sessionPackages: SessionPackageRepository;
}

export interface PatientDataExport {
  patient: Patient;
  anamnesis: Anamnesis | null;
  evolutions: EvolutionNote[];
  conditions: ClinicalCondition[];
  assessments: ConditionAssessment[];
  photos: ConditionPhoto[];
  appointments: Appointment[];
  invoices: Invoice[];
  consents: ConsentRecord[];
  packages: SessionPackage[];
}

/**
 * Tudo o que o sistema mantém sobre o titular (LGPD art. 18): a mesma carga
 * serve a exportação da equipe e o download do próprio paciente no portal
 * (#293). Quem chama já resolveu o titular no escopo da sessão — a equipe
 * por id com a checagem de vínculo, o portal pela conta (POR-RN-08).
 */
export async function loadPatientDataExport(
  repos: PatientDataExportRepos,
  patient: Patient,
): Promise<PatientDataExport> {
  const id = patient.id;
  const [anamnesis, evolutions, conditions, appointments, invoices, consents] =
    await Promise.all([
      repos.anamneses.findByPatientId(id),
      repos.evolutions.findByPatientId(id),
      repos.conditions.findByPatientId(id),
      repos.appointments.findByPatientId(id),
      repos.invoices.findAll({ patientId: id }),
      repos.consentRecords.findByPatientId(id),
    ]);
  const conditionIds = conditions.map((condition) => condition.id);
  const [assessments, photos, packages] = await Promise.all([
    repos.assessments.findByConditionIds(conditionIds),
    repos.conditionPhotos.findByConditionIds(conditionIds),
    repos.sessionPackages.findByPatientId(id),
  ]);
  return {
    patient,
    anamnesis,
    evolutions,
    conditions,
    assessments,
    photos,
    appointments,
    invoices,
    consents,
    packages,
  };
}
