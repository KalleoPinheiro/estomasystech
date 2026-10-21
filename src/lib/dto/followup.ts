import type { FollowUp } from '@/domain/followup/follow-up';

export interface FollowUpDto {
  id: string;
  patientId: string;
  patientName?: string;
  /** Só nas listas: desambigua homônimos (ISO) ou `null` sem data. */
  patientBirthDate?: string | null;
  appointmentId: string | null;
  dueDate: string;
  reason: string;
  status: string;
  isOverdue?: boolean;
  /** Recall por e-mail chegou à última tentativa sem o retorno ser resolvido. */
  recallExhausted?: boolean;
}

export const toFollowUpDto = (
  followUp: FollowUp,
  patientName?: string,
  isOverdue?: boolean,
  recallExhausted?: boolean,
  patientBirthDate?: Date | null,
): FollowUpDto => ({
  id: followUp.id,
  patientId: followUp.patientId,
  patientName,
  patientBirthDate: patientBirthDate?.toISOString(),
  appointmentId: followUp.appointmentId,
  dueDate: followUp.dueDate.toISOString(),
  reason: followUp.reason,
  status: followUp.status,
  isOverdue,
  recallExhausted,
});
