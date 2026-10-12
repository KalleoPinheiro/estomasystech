import type {
  DataRequestKind,
  DataRequestStatus,
  DataSubjectRequest,
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
}

export const toDataSubjectRequestDto = (
  request: DataSubjectRequest,
  patientName?: string,
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
