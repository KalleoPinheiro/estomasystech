/** Foto de paciente anonimizado cujo arquivo ainda não foi apagado. */
export interface PendingPhoto {
  id: string;
}

/** Consulta de paciente anonimizado cujo evento externo ainda existe. */
export interface PendingCalendarEvent {
  appointmentId: string;
  googleEventId: string;
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
  /**
   * Paciente, prontuário e conta de portal numa transação; 0 se já feito ou
   * se surgiu atividade a partir do corte desde a busca.
   */
  anonymizePatient(patientId: string, now: Date, cutoff: Date): Promise<number>;
  findPendingPhotos(limit: number): Promise<PendingPhoto[]>;
  markPhotoAnonymized(photoId: string, now: Date): Promise<void>;
  /** Eventos do Google Agenda de consultas de pacientes já anonimizados (#311). */
  findPendingCalendarEvents(limit: number): Promise<PendingCalendarEvent[]>;
  /** Limpa o id do evento depois de apagá-lo na agenda externa. */
  markCalendarEventRemoved(appointmentId: string): Promise<void>;
  anonymizeAuditEvents(cutoff: Date): Promise<number>;
  /**
   * Entrada `waiting` com o período terminado antes de `today` (AAAA-MM-DD, no
   * fuso da aplicação) vira `expired`, resolvida no fim do período (#311).
   */
  expireWaitlistEntries(today: string): Promise<number>;
  anonymizeWaitlistEntries(cutoff: Date): Promise<number>;
  anonymizeInactiveAccounts(cutoff: Date, now: Date): Promise<number>;
  /**
   * Chaves de avatar (#427) das contas que `anonymizeInactiveAccounts` vai
   * anonimizar com o mesmo corte: o job apaga os arquivos antes, porque a
   * anonimização zera a chave e o arquivo ficaria sem referência.
   */
  findInactiveAvatarKeys(cutoff: Date): Promise<string[]>;
}
