import sharp from 'sharp';
import type { ImageProcessor } from '@/application/ports/image-processor';
import { IDENTITY_IMAGE_MAX_SIDE } from '@/domain/clinic/identity-image';
import { ValidationError } from '@/domain/shared/errors';

/** Teto de pixels decodificados: barra bomba de descompressão (PNG de 1 MB que vira 1 GB). */
const MAX_INPUT_PIXELS = 40_000_000;
const WEBP_QUALITY = 85;

/**
 * Recodifica com sharp: aplica a orientação do EXIF, reduz ao lado máximo e
 * grava WebP sem nenhum metadado (sharp não copia EXIF/XMP/ICC por padrão).
 * GIF animado fica só com o primeiro quadro.
 */
export class SharpImageProcessor implements ImageProcessor {
  async toIdentityWebp(data: Uint8Array): Promise<Uint8Array> {
    try {
      const output = await sharp(data, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(IDENTITY_IMAGE_MAX_SIDE, IDENTITY_IMAGE_MAX_SIDE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      return new Uint8Array(output);
    } catch {
      throw new ValidationError('Imagem corrompida ou ilegível');
    }
  }
}
