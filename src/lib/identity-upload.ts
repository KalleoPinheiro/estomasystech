import type { PhotoStorage } from '@/application/ports/photo-storage';
import { MAX_IDENTITY_UPLOAD_BYTES } from '@/domain/clinic/identity-image';
import { isPhotoStorageAvailable } from '@/infrastructure/storage/unavailable-photo-storage';
import { fail } from '@/lib/api-response';
import { SharedRateLimiter } from '@/lib/auth/rate-limit';

/** Recodificar imagem custa CPU: por conta (avatar) ou clínica (logo). */
export const IDENTITY_UPLOAD_RATE_LIMIT = new SharedRateLimiter(
  'identity-upload',
  10,
  60_000,
);

export type UploadRead =
  | { ok: true; data: Uint8Array }
  | { ok: false; response: Response };

/** Lê o campo `file` do multipart e barra o corpo grande antes de decodificar. */
export async function readIdentityUpload(
  request: Request,
): Promise<UploadRead> {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return {
      ok: false,
      response: fail(
        "Envie o arquivo no campo 'file' (multipart/form-data)",
        400,
      ),
    };
  }
  if (file.size > MAX_IDENTITY_UPLOAD_BYTES) {
    return {
      ok: false,
      response: fail('Imagem excede o limite de 5 MB', 400),
    };
  }
  return { ok: true, data: new Uint8Array(await file.arrayBuffer()) };
}

export const STORAGE_UNAVAILABLE_MESSAGE =
  'O armazenamento de imagens não está disponível neste ambiente. Peça ao suporte para configurar o bucket (PHOTO_STORAGE=s3).';

/** `503` claro quando o armazenamento recusa tudo; `null` quando pode seguir. */
export const storageUnavailable = (storage: PhotoStorage): Response | null =>
  isPhotoStorageAvailable(storage)
    ? null
    : fail(STORAGE_UNAVAILABLE_MESSAGE, 503);

export const tooManyUploads = () =>
  fail('Muitos envios, aguarde um minuto', 429);
