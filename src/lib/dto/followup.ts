import type { FollowUp } from '@/domain/followup/follow-up';

export interface FollowUpDto {
  id: string;
  patientId: string;
  patientName?: string;
  appointmentId: string | null;
  dueDate: string;
  reason: string;
  status: string;
  isOverdue?: boolean;
}

export const toFollowUpDto = (
  followUp: FollowUp,
  patientName?: string,
  isOverdue?: boolean,
): FollowUpDto => ({
  id: followUp.id,
  patientId: followUp.patientId,
  patientName,
  appointmentId: followUp.appointmentId,
  dueDate: followUp.dueDate.toISOString(),
  reason: followUp.reason,
  status: followUp.status,
  isOverdue,
});
