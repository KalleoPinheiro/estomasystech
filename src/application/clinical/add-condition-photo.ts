import type { PhotoStorage } from '@/application/ports/photo-storage';
import type {
  ClinicalConditionRepository,
  ConditionPhotoRepository,
} from '@/domain/clinical/clinical-repositories';
import {
  ConditionPhoto,
  detectImageType,
  MAX_PHOTO_BYTES,
  type PhotoOrigin,
} from '@/domain/clinical/condition-photo';
import { stripImageMetadata } from '@/domain/clinical/image-sanitizer';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { logger } from '@/lib/observability/logger';

export interface AddConditionPhotoInput {
  conditionId: string;
  data: Uint8Array;
  assessmentId?: string | null;
  origin?: PhotoOrigin;
  patientNote?: string | null;
}

export class AddConditionPhoto {
  constructor(
    private readonly photos: ConditionPhotoRepository,
    private readonly conditions: ClinicalConditionRepository,
    private readonly storage: PhotoStorage,
  ) {}

  async execute(input: AddConditionPhotoInput): Promise<ConditionPhoto> {
    const condition = await this.conditions.findById(input.conditionId);
    if (!condition) {
      throw new NotFoundError('Condição', input.conditionId);
    }
    if (input.data.byteLength > MAX_PHOTO_BYTES) {
      throw new ValidationError('Imagem excede o limite de 5 MB');
    }

    // Tipo real detectado por magic bytes — Content-Type declarado é ignorado.
    const contentType = detectImageType(input.data);
    if (!contentType) {
      throw new ValidationError(
        'Arquivo não é uma imagem JPEG, PNG ou WebP válida',
      );
    }

    // Privacidade (SEC1-05..08): EXIF/XMP/comentários nunca chegam ao storage —
    // foto de celular carrega GPS da casa do paciente.
    const sanitized = stripImageMetadata(input.data);
    if (!sanitized.stripped) {
      // Estrutura inesperada: os bytes originais seguem para o storage e podem
      // conter EXIF. Registrar é o que permite a clínica detectar o caso em vez
      // de supor que a remoção sempre funcionou.
      logger.warn(
        `Sanitização de imagem não aplicada (condição ${input.conditionId}) — metadados podem ter sido preservados`,
      );
    }

    const photo = ConditionPhoto.create({
      conditionId: input.conditionId,
      contentType,
      sizeBytes: sanitized.data.byteLength,
      assessmentId: input.assessmentId ?? null,
      origin: input.origin ?? 'staff',
      patientNote: input.patientNote ?? null,
    });

    await this.storage.write(photo.id, sanitized.data);
    try {
      await this.photos.save(photo);
    } catch (error) {
      // Falha ao gravar metadados → não deixa arquivo órfão no disco.
      await this.storage.remove(photo.id).catch(() => undefined);
      throw error;
    }
    return photo;
  }
}
