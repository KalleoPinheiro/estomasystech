import type { Anamnesis } from '@/domain/clinical/anamnesis';

export interface AnamnesisDto {
  patientId: string;
  comorbidities: string;
  allergies: string;
  medications: string;
  surgicalHistory: string;
  notes: string;
  updatedAt: string;
}

export const toAnamnesisDto = (anamnesis: Anamnesis): AnamnesisDto => ({
  patientId: anamnesis.patientId,
  comorbidities: anamnesis.comorbidities,
  allergies: anamnesis.allergies,
  medications: anamnesis.medications,
  surgicalHistory: anamnesis.surgicalHistory,
  notes: anamnesis.notes,
  updatedAt: anamnesis.updatedAt.toISOString(),
});
