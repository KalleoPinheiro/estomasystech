import type { PatientDataExport } from '@/application/patients/load-patient-data-export';
import { toAnamnesisDto } from './anamnesis';
import { toAppointmentDto } from './appointment';
import { toInvoiceDto } from './billing';
import {
  toAssessmentDto,
  toConditionDto,
  toConditionPhotoDto,
} from './clinical-condition';
import { toEvolutionNoteDto } from './evolution-note';
import { toPatientDto } from './patient';

/**
 * JSON da exportação LGPD do titular (art. 18): o mesmo formato na
 * exportação da equipe e no download do portal (#293).
 */
export const toPatientExportDto = (data: PatientDataExport) => ({
  exportedAt: new Date().toISOString(),
  // Direito de acesso (art. 18): o titular recebe o próprio CPF por inteiro.
  patient: { ...toPatientDto(data.patient, data.guardian), cpf: data.patient.cpf },
  anamnesis: data.anamnesis ? toAnamnesisDto(data.anamnesis) : null,
  evolutions: data.evolutions.map(toEvolutionNoteDto),
  conditions: data.conditions.map(toConditionDto),
  assessments: data.assessments.map(toAssessmentDto),
  photos: data.photos.map(toConditionPhotoDto),
  appointments: data.appointments.map((appointment) =>
    toAppointmentDto(appointment),
  ),
  invoices: data.invoices.map((invoice) => toInvoiceDto(invoice)),
  consents: data.consents.map((consent) => ({
    id: consent.id,
    textHash: consent.textHash,
    acceptedAt: consent.acceptedAt.toISOString(),
  })),
  packages: data.packages.map((pkg) => ({
    id: pkg.id,
    procedureId: pkg.procedureId,
    totalSessions: pkg.totalSessions,
    usedSessions: pkg.usedSessions,
    priceCents: pkg.priceCents,
  })),
});

export type PatientExportDto = ReturnType<typeof toPatientExportDto>;
