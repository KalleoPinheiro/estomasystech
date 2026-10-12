import {
  InvalidStatusTransitionError,
  ValidationError,
} from '../shared/errors';
import { newId } from '../shared/id';

/** Correção cadastral ou eliminação/anonimização (LGPD art. 18, III e IV/VI). */
export const DATA_REQUEST_KINDS = ['correction', 'erasure'] as const;
export type DataRequestKind = (typeof DATA_REQUEST_KINDS)[number];

export const DATA_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'rejected',
] as const;
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number];

export interface DataSubjectRequestProps {
  patientId: string;
  kind: DataRequestKind;
  /** O que o titular pede: obrigatório na correção, opcional na eliminação. */
  details?: string | null;
}

export interface DataSubjectRequestState {
  id: string;
  patientId: string;
  kind: DataRequestKind;
  details: string | null;
  status: DataRequestStatus;
  /** Justificativa do Admin ao decidir — o paciente vê no portal. */
  resolution: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export const MAX_DETAILS_LENGTH = 1000;
export const MAX_RESOLUTION_LENGTH = 1000;

/**
 * Pedido do titular, feito pelo portal, que a clínica analisa (#293). Aceitar
 * registra a decisão; a correção do cadastro continua sendo feita pela equipe
 * na ficha, e a anonimização segue a política de retenção (#294): o
 * prontuário tem guarda legal de 20 anos (Lei 13.787/2018), então eliminar não
 * é automático.
 */
export class DataSubjectRequest {
  private constructor(private readonly state: DataSubjectRequestState) {}

  static create(
    props: DataSubjectRequestProps,
    now = new Date(),
  ): DataSubjectRequest {
    if (props.patientId.trim().length === 0) {
      throw new ValidationError('Paciente é obrigatório');
    }
    if (!DATA_REQUEST_KINDS.includes(props.kind)) {
      throw new ValidationError('Tipo de pedido inválido');
    }
    const details = props.details?.trim() || null;
    if (props.kind === 'correction' && !details) {
      throw new ValidationError('Descreva o que precisa ser corrigido');
    }
    if (details && details.length > MAX_DETAILS_LENGTH) {
      throw new ValidationError(
        `A descrição deve ter até ${MAX_DETAILS_LENGTH} caracteres`,
      );
    }
    return new DataSubjectRequest({
      id: newId(),
      patientId: props.patientId,
      kind: props.kind,
      details,
      status: 'pending',
      resolution: null,
      createdAt: now,
      resolvedAt: null,
    });
  }

  static restore(state: DataSubjectRequestState): DataSubjectRequest {
    return new DataSubjectRequest({ ...state });
  }

  private resolve(
    status: DataRequestStatus,
    justification: string,
    at: Date,
  ): DataSubjectRequest {
    if (this.state.status !== 'pending') {
      throw new InvalidStatusTransitionError('Este pedido já foi analisado');
    }
    const resolution = justification.trim();
    if (!resolution) {
      throw new ValidationError('A justificativa é obrigatória');
    }
    if (resolution.length > MAX_RESOLUTION_LENGTH) {
      throw new ValidationError(
        `A justificativa deve ter até ${MAX_RESOLUTION_LENGTH} caracteres`,
      );
    }
    return new DataSubjectRequest({
      ...this.state,
      status,
      resolution,
      resolvedAt: at,
    });
  }

  accept(justification: string, at = new Date()): DataSubjectRequest {
    return this.resolve('accepted', justification, at);
  }

  reject(justification: string, at = new Date()): DataSubjectRequest {
    return this.resolve('rejected', justification, at);
  }

  get id(): string {
    return this.state.id;
  }
  get patientId(): string {
    return this.state.patientId;
  }
  get kind(): DataRequestKind {
    return this.state.kind;
  }
  get details(): string | null {
    return this.state.details;
  }
  get status(): DataRequestStatus {
    return this.state.status;
  }
  get resolution(): string | null {
    return this.state.resolution;
  }
  get createdAt(): Date {
    return this.state.createdAt;
  }
  get resolvedAt(): Date | null {
    return this.state.resolvedAt;
  }
}

export interface DataSubjectRequestRepository {
  save(request: DataSubjectRequest): Promise<void>;
  findById(id: string): Promise<DataSubjectRequest | null>;
  /** Pedidos do titular, do mais recente ao mais antigo. */
  findByPatient(patientId: string): Promise<DataSubjectRequest[]>;
  /** Fila da clínica num status; pendentes por ordem de chegada. */
  listByStatus(status: DataRequestStatus): Promise<DataSubjectRequest[]>;
}
