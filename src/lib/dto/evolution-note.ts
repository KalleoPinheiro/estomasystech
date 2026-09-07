import type { EvolutionNote } from '@/domain/clinical/evolution-note';

export interface EvolutionNoteDto {
  id: string;
  patientId: string;
  appointmentId: string | null;
  professionalId: string | null;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  createdAt: string;
}

export const toEvolutionNoteDto = (note: EvolutionNote): EvolutionNoteDto => ({
  id: note.id,
  patientId: note.patientId,
  appointmentId: note.appointmentId,
  professionalId: note.professionalId,
  subjective: note.subjective,
  objective: note.objective,
  assessment: note.assessment,
  plan: note.plan,
  createdAt: note.createdAt.toISOString(),
});
