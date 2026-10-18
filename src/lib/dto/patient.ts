import type { Guardian } from '@/domain/guardian/guardian';
import type { Patient } from '@/domain/patient/patient';
import { type GuardianDto, toGuardianDto } from './guardian';

export interface PatientDto {
  id: string;
  fullName: string;
  /** Contato opcional (#325); `null` quando não informado. */
  email: string | null;
  phone: string;
  /** Telefone legado fora do E.164 BR: a tela pede correção (#324). */
  phoneNeedsCorrection: boolean;
  /** CPF mascarado (`***.***.789-**`); o número inteiro só sai no recibo (#326). */
  cpfMasked: string | null;
  birthDate: string | null;
  notes: string | null;
  referredByPartnerId: string | null;
  guardianId: string | null;
  /** Quando o paciente encerrou o acesso do responsável ao portal (ADR-028). */
  guardianPortalRevokedAt: string | null;
  /** Só nas respostas de detalhe (ficha, documentos); a listagem traz `guardianId`. */
  guardian?: GuardianDto | null;
  active: boolean;
  anonymized: boolean;
  createdAt: string;
}

export const toPatientDto = (
  patient: Patient,
  guardian?: Guardian | null,
): PatientDto => ({
  id: patient.id,
  fullName: patient.fullName,
  email: patient.email,
  phone: patient.phone,
  phoneNeedsCorrection: patient.phoneNeedsCorrection,
  cpfMasked: patient.cpfMasked,
  birthDate: patient.birthDate?.toISOString() ?? null,
  notes: patient.notes,
  referredByPartnerId: patient.referredByPartnerId,
  guardianId: patient.guardianId,
  guardianPortalRevokedAt:
    patient.guardianPortalRevokedAt?.toISOString() ?? null,
  ...(guardian !== undefined && {
    guardian: guardian ? toGuardianDto(guardian) : null,
  }),
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
  email: string | null;
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
