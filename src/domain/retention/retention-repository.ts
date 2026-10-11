/** Foto de paciente anonimizado cujo arquivo ainda não foi apagado. */
export interface PendingPhoto {
  id: string;
}

/**
 * Anonimização por prazo (#294). Escopado como os demais: em escopo de
 * clínica age só nela; em escopo de sistema só a trilha de plataforma
 * (eventos sem empresa) é tratada. Cada método é idempotente e devolve
 * quantos registros mudou.
 */
export interface RetentionRepository {
  /** Pacientes cuja última atividade clínica é anterior ao corte. */
  findPatientsDue(cutoff: Date, limit: number): Promise<string[]>;
  /** Paciente, prontuário e conta de portal numa transação; 0 se já feito. */
  anonymizePatient(patientId: string, now: Date): Promise<number>;
  findPendingPhotos(limit: number): Promise<PendingPhoto[]>;
  markPhotoAnonymized(photoId: string, now: Date): Promise<void>;
  anonymizeAuditEvents(cutoff: Date): Promise<number>;
  anonymizeWaitlistEntries(cutoff: Date): Promise<number>;
  anonymizeInactiveAccounts(cutoff: Date, now: Date): Promise<number>;
}
