import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';

export const PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Cota de fotos que o paciente envia pelo portal, em janela móvel de 24 h (#213). */
export const PATIENT_MAX_PHOTOS_PER_DAY = 10;

/** Origem da foto: equipe (prontuário) ou paciente (monitoramento remoto). */
export const PHOTO_ORIGINS = ['staff', 'patient'] as const;
export type PhotoOrigin = (typeof PHOTO_ORIGINS)[number];

/** Triagem de foto enviada pelo paciente. */
export const TRIAGE_STATUSES = ['pending', 'reviewed', 'escalated'] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

export interface ConditionPhotoProps {
  conditionId: string;
  contentType: PhotoContentType;
  sizeBytes: number;
  assessmentId?: string | null;
  origin?: PhotoOrigin;
  /** Observação do paciente no envio remoto. */
  patientNote?: string | null;
  triageStatus?: TriageStatus | null;
}

export interface ConditionPhotoState extends ConditionPhotoProps {
  id: string;
  createdAt: Date;
}

/** Foto de evolução de uma condição — arquivo fica no storage, aqui só metadados. */
export class ConditionPhoto {
  private constructor(private readonly state: ConditionPhotoState) {}

  static create(props: ConditionPhotoProps): ConditionPhoto {
    if (!PHOTO_CONTENT_TYPES.includes(props.contentType)) {
      throw new ValidationError(
        'Formato de imagem não suportado (JPEG, PNG ou WebP)',
      );
    }
    if (!Number.isInteger(props.sizeBytes) || props.sizeBytes <= 0) {
      throw new ValidationError('Arquivo de imagem vazio');
    }
    if (props.sizeBytes > MAX_PHOTO_BYTES) {
      throw new ValidationError('Imagem excede o limite de 5 MB');
    }
    const origin = props.origin ?? 'staff';
    return new ConditionPhoto({
      conditionId: props.conditionId,
      contentType: props.contentType,
      sizeBytes: props.sizeBytes,
      assessmentId: props.assessmentId ?? null,
      origin,
      patientNote: props.patientNote?.trim() || null,
      // Foto do paciente nasce pendente de triagem; foto da equipe não entra na fila.
      triageStatus: origin === 'patient' ? 'pending' : null,
      id: newId(),
      createdAt: new Date(),
    });
  }

  static restore(state: ConditionPhotoState): ConditionPhoto {
    return new ConditionPhoto({ ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get conditionId(): string {
    return this.state.conditionId;
  }

  get assessmentId(): string | null {
    return this.state.assessmentId ?? null;
  }

  get contentType(): PhotoContentType {
    return this.state.contentType;
  }

  get sizeBytes(): number {
    return this.state.sizeBytes;
  }

  get origin(): PhotoOrigin {
    return this.state.origin ?? 'staff';
  }

  get patientNote(): string | null {
    return this.state.patientNote ?? null;
  }

  get triageStatus(): TriageStatus | null {
    return this.state.triageStatus ?? null;
  }

  /** Triagem: avaliada (manter plano) ou escalada (antecipar retorno). */
  withTriage(status: Exclude<TriageStatus, 'pending'>): ConditionPhoto {
    if (this.origin !== 'patient') {
      throw new ValidationError(
        'Só fotos enviadas pelo paciente passam por triagem',
      );
    }
    return new ConditionPhoto({ ...this.state, triageStatus: status });
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}

/** Assinatura mágica: byte esperado por posição (posições fora da lista são livres). */
type MagicSignature = Array<[offset: number, value: number]>;

const IMAGE_SIGNATURES: Array<{
  type: PhotoContentType;
  signature: MagicSignature;
}> = [
  {
    type: 'image/jpeg',
    signature: [
      [0, 0xff],
      [1, 0xd8],
      [2, 0xff],
    ],
  },
  {
    type: 'image/png',
    signature: [
      [0, 0x89],
      [1, 0x50],
      [2, 0x4e],
      [3, 0x47],
    ],
  },
  {
    // RIFF....WEBP
    type: 'image/webp',
    signature: [
      [0, 0x52],
      [1, 0x49],
      [2, 0x46],
      [3, 0x46],
      [8, 0x57],
      [9, 0x45],
      [10, 0x42],
      [11, 0x50],
    ],
  },
];

/**
 * Detecção por magic bytes — extensão/Content-Type declarados não bastam
 * (upload malicioso com content-type falso).
 */
export function detectImageType(bytes: Uint8Array): PhotoContentType | null {
  const match = IMAGE_SIGNATURES.find(({ signature }) =>
    signature.every(
      ([offset, value]) => bytes.length > offset && bytes[offset] === value,
    ),
  );
  return match?.type ?? null;
}
