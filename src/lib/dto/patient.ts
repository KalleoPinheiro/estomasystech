import type { Patient } from '@/domain/patient/patient';

export interface PatientDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  /** Telefone legado fora do E.164 BR: a tela pede correção (#324). */
  phoneNeedsCorrection: boolean;
  birthDate: string | null;
  notes: string | null;
  referredByPartnerId: string | null;
  active: boolean;
  anonymized: boolean;
  createdAt: string;
}

export const toPatientDto = (patient: Patient): PatientDto => ({
  id: patient.id,
  fullName: patient.fullName,
  email: patient.email,
  phone: patient.phone,
  phoneNeedsCorrection: patient.phoneNeedsCorrection,
  birthDate: patient.birthDate?.toISOString() ?? null,
  notes: patient.notes,
  referredByPartnerId: patient.referredByPartnerId,
  active: patient.isActive,
  anonymized: patient.isAnonymized,
  createdAt: patient.createdAt.toISOString(),
});

/**
 * DTOs de portal — minimização de dados (LGPD art. 6º, III):
 * cada papel recebe apenas o estritamente necessário à sua finalidade.
 */

/** Perfil do paciente no próprio portal: sem observações internas da equipe. */
export interface PortalPatientProfileDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}

export const toPortalPatientProfileDto = (
  patient: Patient,
): PortalPatientProfileDto => ({
  id: patient.id,
  fullName: patient.fullName,
  email: patient.email,
  phone: patient.phone,
});

/** Paciente visto pelo parceiro: apenas identificação nominal da indicação. */
export interface ReferredPatientSummaryDto {
  id: string;
  fullName: string;
}

export const toReferredPatientSummaryDto = (
  patient: Patient,
): ReferredPatientSummaryDto => ({
  id: patient.id,
  fullName: patient.fullName,
});
