import type { FollowUp, FollowUpStatus } from './follow-up';

export interface FollowUpFilter {
  status?: FollowUpStatus;
  dueBefore?: Date;
  patientId?: string;
}

export interface FollowUpRepository {
  save(followUp: FollowUp): Promise<void>;
  findById(id: string): Promise<FollowUp | null>;
  /** Listagem das telas — limitada a `MAX_ROWS`. */
  findAll(filter?: FollowUpFilter): Promise<FollowUp[]>;
  /** Retornos `pending` vencidos antes de `dueBefore`, sem corte (job de lembretes). */
  findPendingDueBefore(dueBefore: Date): Promise<FollowUp[]>;
}
