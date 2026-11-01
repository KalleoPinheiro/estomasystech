import type { Invoice } from '@/domain/billing/invoice';
import type { InvoiceRepository } from '@/domain/billing/invoice-repository';
import type { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import type {
  ClinicalConditionRepository,
  ConditionAssessmentRepository,
  ConditionPhotoRepository,
} from '@/domain/clinical/clinical-repositories';
import type { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import type { ConditionPhoto } from '@/domain/clinical/condition-photo';
import type { FollowUp } from '@/domain/followup/follow-up';
import type { FollowUpRepository } from '@/domain/followup/follow-up-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { NotFoundError } from '@/domain/shared/errors';
import { shiftZonedMonths } from '@/domain/shared/time-zone';

export interface ConditionWithAssessments {
  condition: ClinicalCondition;
  assessments: ConditionAssessment[];
  photos?: ConditionPhoto[];
}

/** Condição do portal do paciente: as fotos sempre vêm (vazio sem foto), diferente do parceiro. */
export interface PatientConditionWithAssessments
  extends ConditionWithAssessments {
  photos: ConditionPhoto[];
}

export interface PatientPortalData {
  patient: Patient;
  appointments: Appointment[];
  conditions: PatientConditionWithAssessments[];
  invoices: Invoice[];
  followUps: FollowUp[];
}

const HISTORY_MONTHS = 24;

/**
 * Dados do portal do paciente — sempre escopados ao titular da conta da
 * sessão (`resolvePortalPatient`, #196), nunca a um e-mail.
 */
export class GetPatientPortalData {
  constructor(
    private readonly patients: PatientRepository,
    private readonly appointments: AppointmentRepository,
    private readonly conditions: ClinicalConditionRepository,
    private readonly assessments: ConditionAssessmentRepository,
    private readonly invoices: InvoiceRepository,
    private readonly followUps: FollowUpRepository,
    private readonly photos?: ConditionPhotoRepository,
  ) {}

  async execute(input: { patientId: string }): Promise<PatientPortalData> {
    const patient = await this.patients.findById(input.patientId);
    if (!patient?.isActive) {
      throw new NotFoundError('Paciente', input.patientId);
    }

    const cutoff = shiftZonedMonths(new Date(), -HISTORY_MONTHS);

    const [appointments, conditions, invoices, followUps] = await Promise.all([
      this.appointments.findByPatientId(patient.id, { endsAfter: cutoff }),
      this.conditions.findByPatientId(patient.id),
      this.invoices.findAll({ patientId: patient.id }),
      this.followUps.findAll({ patientId: patient.id, status: 'pending' }),
    ]);

    // Uma query em lote para todas as avaliações e fotos (sem N+1 por condição).
    const conditionIds = conditions.map((c) => c.id);
    const [allAssessments, allPhotos] = await Promise.all([
      this.assessments.findByConditionIds(conditionIds),
      this.photos?.findByConditionIds(conditionIds) ?? Promise.resolve([]),
    ]);
    const photosByCondition = new Map<string, ConditionPhoto[]>();
    for (const photo of allPhotos) {
      const group = photosByCondition.get(photo.conditionId);
      if (group) {
        group.push(photo);
      } else {
        photosByCondition.set(photo.conditionId, [photo]);
      }
    }
    const assessmentsByCondition = new Map<string, typeof allAssessments>();
    for (const assessment of allAssessments) {
      const group = assessmentsByCondition.get(assessment.conditionId);
      if (group) {
        group.push(assessment);
      } else {
        assessmentsByCondition.set(assessment.conditionId, [assessment]);
      }
    }

    return {
      patient,
      appointments,
      conditions: conditions.map((condition) => ({
        condition,
        assessments: assessmentsByCondition.get(condition.id) ?? [],
        photos: photosByCondition.get(condition.id) ?? [],
      })),
      invoices,
      followUps,
    };
  }
}
