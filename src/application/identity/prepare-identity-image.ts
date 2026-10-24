import type { ImageProcessor } from '@/application/ports/image-processor';
import {
  assertWithinLimit,
  detectIdentityImage,
  HEIC_UNSUPPORTED_MESSAGE,
  type IdentityImageFormat,
  MAX_IDENTITY_IMAGE_BYTES,
  MAX_IDENTITY_UPLOAD_BYTES,
  prepareSvg,
} from '@/domain/clinic/identity-image';
import { ValidationError } from '@/domain/shared/errors';

export interface PreparedIdentityImage {
  data: Uint8Array;
  format: IdentityImageFormat;
}

/**
 * Valida e normaliza o arquivo enviado como logo ou avatar. O tipo vem dos
 * bytes; SVG passa pelo sanitizador e raster é recodificado em WebP.
 */
export async function prepareIdentityImage(
  data: Uint8Array,
  processor: ImageProcessor,
): Promise<PreparedIdentityImage> {
  if (data.byteLength === 0) {
    throw new ValidationError('Arquivo de imagem vazio');
  }
  if (data.byteLength > MAX_IDENTITY_UPLOAD_BYTES) {
    throw new ValidationError('Imagem excede o limite de 5 MB');
  }
  const detected = detectIdentityImage(data);
  if (detected.type === 'heic') {
    throw new ValidationError(HEIC_UNSUPPORTED_MESSAGE);
  }
  if (detected.type === 'svg') {
    if (data.byteLength > MAX_IDENTITY_IMAGE_BYTES) {
      throw new ValidationError('SVG excede o limite de 1 MB');
    }
    return { data: prepareSvg(detected.text), format: 'svg' };
  }
  const webp = await processor.toIdentityWebp(data);
  assertWithinLimit(webp);
  return { data: webp, format: 'webp' };
}
