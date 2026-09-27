import type {
  ClinicalConditionRepository,
  ConditionAssessmentRepository,
} from '@/domain/clinical/clinical-repositories';
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

export interface ReferredPatientData {
  patient: Patient;
  appointments: Appointment[];
  conditions: ConditionWithAssessments[];
}

export interface PartnerPortalData {
  partner: Partner;
  referredPatients: ReferredPatientData[];
}

/**
 * Dados do portal do médico parceiro — apenas pacientes indicados por ele.
 * Sem dados financeiros e sem anamnese: o parceiro acompanha a evolução clínica da indicação.
 */
export class GetPartnerPortalData {
  constructor(
    private readonly partners: PartnerRepository,
    private readonly patients: PatientRepository,
    private readonly appointments: AppointmentRepository,
    private readonly conditions: ClinicalConditionRepository,
    private readonly assessments: ConditionAssessmentRepository,
  ) {}

  async execute(input: { partnerId: string }): Promise<PartnerPortalData> {
    const partner = await this.partners.findById(input.partnerId);
    if (!partner?.isActive) {
      throw new NotFoundError('Parceiro', input.partnerId);
    }

    const referred = await this.patients.findByReferrer(partner.id);
    const patientIds = referred.map((p) => p.id);

    // Três queries em lote no total, independentemente do nº de pacientes (sem N+1).
    const [allAppointments, allConditions] = await Promise.all([
      this.appointments.findByPatientIds(patientIds),
      this.conditions.findByPatientIds(patientIds),
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

    const referredPatients = referred.map((patient) => ({
      patient,
      appointments: appointmentsByPatient.get(patient.id) ?? [],
      conditions: (conditionsByPatient.get(patient.id) ?? []).map(
        (condition) => ({
          condition,
          assessments: assessmentsByCondition.get(condition.id) ?? [],
        }),
      ),
    }));

    return { partner, referredPatients };
  }
}
