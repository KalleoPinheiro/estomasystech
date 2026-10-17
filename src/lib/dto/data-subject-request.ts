import {
  type DataRequestKind,
  type DataRequestStatus,
  type DataSubjectRequest,
  daysUntilDeadline,
  deadlineDateKey,
} from '@/domain/patient/data-subject-request';

export interface DataSubjectRequestDto {
  id: string;
  patientId: string;
  /** Só na fila do Admin; o portal não precisa do próprio nome. */
  patientName?: string;
  kind: DataRequestKind;
  details: string | null;
  status: DataRequestStatus;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /** Dia limite (`AAAA-MM-DD`, fuso da aplicação) para responder (#312). */
  deadlineDate: string;
  /** Dias até o limite; negativo = vencido. `null` se já foi analisado. */
  daysLeft: number | null;
}

export const toDataSubjectRequestDto = (
  request: DataSubjectRequest,
  patientName?: string,
  now: Date = new Date(),
): DataSubjectRequestDto => ({
  id: request.id,
  patientId: request.patientId,
  patientName,
  kind: request.kind,
  details: request.details,
  status: request.status,
  resolution: request.resolution,
  createdAt: request.createdAt.toISOString(),
  resolvedAt: request.resolvedAt?.toISOString() ?? null,
  deadlineDate: deadlineDateKey(request.createdAt),
  daysLeft:
    request.status === 'pending'
      ? daysUntilDeadline(request.createdAt, now)
      : null,
});

export const DATA_REQUEST_KIND_LABELS: Record<DataRequestKind, string> = {
  correction: 'Correção de dados cadastrais',
  erasure: 'Eliminação ou anonimização',
};

export const DATA_REQUEST_STATUS_LABELS: Record<DataRequestStatus, string> = {
  pending: 'Em análise',
  accepted: 'Aceito',
  rejected: 'Recusado',
};
