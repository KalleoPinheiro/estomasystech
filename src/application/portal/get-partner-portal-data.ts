import type { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import type {
  ClinicalConditionRepository,
  ConditionAssessmentRepository,
} from '@/domain/clinical/clinical-repositories';
import type { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import {
  PartnerShareConsent,
  type PartnerShareConsentRepository,
} from '@/domain/consent/partner-share-consent';
import type { Partner } from '@/domain/partner/partner';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { NotFoundError } from '@/domain/shared/errors';
import type { ConditionWithAssessments } from './get-patient-portal-data';

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

/** Mesmo limite de histórico do portal do paciente (#292). */
export const PARTNER_HISTORY_MONTHS = 24;

export interface ReferredPatientData {
  patient: Patient;
  /** Consentimento ativo do paciente para este parceiro (#292). */
  sharing: boolean;
  /** Teve consulta realizada na janela — o que o parceiro vê sem consentimento. */
  attended: boolean;
  /** Vazio sem consentimento. */
  appointments: Appointment[];
  /** Vazio sem consentimento. */
  conditions: ConditionWithAssessments[];
}

export interface PartnerPortalData {
  partner: Partner;
  referredPatients: ReferredPatientData[];
}

export interface PartnerShareConsentPolicy {
  repository: PartnerShareConsentRepository;
  /** Texto vigente: aceite de outra versão não vale. */
  consentText: string;
}

function historyCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - PARTNER_HISTORY_MONTHS);
  return cutoff;
}

/**
 * Condição entra se foi aberta na janela ou tem avaliação na janela; a
 * avaliação, só se registrada na janela.
 */
function conditionsInWindow(
  conditions: ClinicalCondition[],
  assessmentsByCondition: Map<string, ConditionAssessment[]>,
  cutoff: Date,
): ConditionWithAssessments[] {
  const since = cutoff.getTime();
  return conditions
    .map((condition) => ({
      condition,
      assessments: (assessmentsByCondition.get(condition.id) ?? []).filter(
        (assessment) => assessment.createdAt.getTime() >= since,
      ),
    }))
    .filter(
      ({ condition, assessments }) =>
        condition.createdAt.getTime() >= since || assessments.length > 0,
    );
}

/**
 * Dados do portal do médico parceiro — apenas pacientes indicados por ele.
 * Sem dados financeiros e sem anamnese. Consultas, condições e avaliações só
 * com consentimento ativo do paciente para este parceiro e só dos últimos 24
 * meses; sem consentimento, o parceiro vê apenas se o paciente foi atendido
 * (#292, decisão de @KalleoPinheiro na #216).
 */
export class GetPartnerPortalData {
  constructor(
    private readonly partners: PartnerRepository,
    private readonly patients: PatientRepository,
    private readonly appointments: AppointmentRepository,
    private readonly conditions: ClinicalConditionRepository,
    private readonly assessments: ConditionAssessmentRepository,
    private readonly consents: PartnerShareConsentPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: { partnerId: string }): Promise<PartnerPortalData> {
    const partner = await this.partners.findById(input.partnerId);
    if (!partner?.isActive) {
      throw new NotFoundError('Parceiro', input.partnerId);
    }

    const referred = await this.patients.findByReferrer(partner.id);
    const cutoff = historyCutoff(this.now());
    const sharingIds = await this.sharingPatientIds(partner.id, referred);

    // Janela aplicada no banco; condições e avaliações só de quem consentiu.
    const [allAppointments, allConditions] = await Promise.all([
      this.appointments.findByPatientIds(
        referred.map((p) => p.id),
        { endsAfter: cutoff },
      ),
      this.conditions.findByPatientIds([...sharingIds]),
    ]);
    const allAssessments = await this.assessments.findByConditionIds(
      allConditions.map((c) => c.id),
    );

    const appointmentsByPatient = groupBy(allAppointments, (a) => a.patientId);
    const conditionsByPatient = groupBy(allConditions, (c) => c.patientId);
    const assessmentsByCondition = groupBy(
      allAssessments,
      (a) => a.conditionId,
    );

    const referredPatients = referred.map((patient) => {
      const appointments = appointmentsByPatient.get(patient.id) ?? [];
      const sharing = sharingIds.has(patient.id);
      return {
        patient,
        sharing,
        attended: appointments.some((a) => a.status === 'completed'),
        appointments: sharing ? appointments : [],
        conditions: sharing
          ? conditionsInWindow(
              conditionsByPatient.get(patient.id) ?? [],
              assessmentsByCondition,
              cutoff,
            )
          : [],
      };
    });

    return { partner, referredPatients };
  }

  private async sharingPatientIds(
    partnerId: string,
    patients: readonly Patient[],
  ): Promise<Set<string>> {
    const records = await this.consents.repository.findByPartnerAndPatientIds(
      partnerId,
      patients.map((p) => p.id),
    );
    const byPatient = groupBy(records, (r) => r.patientId);
    // O titular entra no status: aceite do representante vence 90 dias após os 18 (#375).
    return new Set(
      patients
        .filter(
          (patient) =>
            PartnerShareConsent.resolveStatus(
              byPatient.get(patient.id) ?? [],
              partnerId,
              this.consents.consentText,
              patient,
              this.now(),
            ).active,
        )
        .map((patient) => patient.id),
    );
  }
}
