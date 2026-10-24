import sharp, { type Sharp } from 'sharp';
import { describe, expect, it } from 'vitest';
import { IDENTITY_IMAGE_MAX_SIDE } from '@/domain/clinic/identity-image';
import { ValidationError } from '@/domain/shared/errors';
import { SharpImageProcessor } from '@/infrastructure/images/sharp-image-processor';

const processor = new SharpImageProcessor();

const solid = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 4, background: '#0a8f7a' },
  });

describe('Feature: Recodificação de imagem de identidade (#427)', () => {
  describe('Cenário: formatos aceitos viram WebP no tamanho de exibição', () => {
    it.each([
      ['PNG', (s: Sharp) => s.png().toBuffer()],
      ['JPEG', (s: Sharp) => s.jpeg().toBuffer()],
      ['WebP', (s: Sharp) => s.webp().toBuffer()],
      ['GIF', (s: Sharp) => s.gif().toBuffer()],
      ['AVIF', (s: Sharp) => s.avif().toBuffer()],
    ])(
      'Dado um %s, Quando recodificar, Então sai WebP',
      async (_nome, encode) => {
        const input = await encode(solid(64, 64));

        const out = await processor.toIdentityWebp(input);

        expect((await sharp(out).metadata()).format).toBe('webp');
      },
    );

    it('Dada foto grande, Quando recodificar, Então o lado maior respeita o limite e a proporção', async () => {
      const input = await solid(2000, 1000).png().toBuffer();

      const meta = await sharp(
        await processor.toIdentityWebp(input),
      ).metadata();

      expect(meta.width).toBe(IDENTITY_IMAGE_MAX_SIDE);
      expect(meta.height).toBe(IDENTITY_IMAGE_MAX_SIDE / 2);
    });

    it('Dada imagem pequena, Quando recodificar, Então não é ampliada', async () => {
      const input = await solid(40, 30).png().toBuffer();

      const meta = await sharp(
        await processor.toIdentityWebp(input),
      ).metadata();

      expect([meta.width, meta.height]).toEqual([40, 30]);
    });

    it('Dada logo com transparência, Quando recodificar, Então o canal alfa é preservado', async () => {
      const input = await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();

      const meta = await sharp(
        await processor.toIdentityWebp(input),
      ).metadata();

      expect(meta.hasAlpha).toBe(true);
    });
  });

  describe('Cenário: privacidade — metadado do celular não chega ao armazenamento', () => {
    it('Dada foto com EXIF (GPS e autor), Quando recodificar, Então a saída não tem EXIF', async () => {
      const input = await solid(32, 32)
        .jpeg()
        .withExif({ IFD0: { Copyright: 'segredo-da-casa-do-paciente' } })
        .toBuffer();
      expect((await sharp(input).metadata()).exif).toBeDefined();

      const out = await processor.toIdentityWebp(input);

      expect((await sharp(out).metadata()).exif).toBeUndefined();
      expect(Buffer.from(out).includes('segredo-da-casa-do-paciente')).toBe(
        false,
      );
    });

    it('Dada foto girada pelo EXIF, Quando recodificar, Então a orientação é aplicada nos pixels', async () => {
      const input = await solid(100, 50)
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();

      const meta = await sharp(
        await processor.toIdentityWebp(input),
      ).metadata();

      expect([meta.width, meta.height]).toEqual([50, 100]);
    });
  });

  describe('Cenário: arquivo que não decodifica', () => {
    it('Dados bytes de PNG truncados, Quando recodificar, Então ValidationError claro', async () => {
      const png = await solid(64, 64).png().toBuffer();

      await expect(
        processor.toIdentityWebp(png.subarray(0, 20)),
      ).rejects.toThrow(new ValidationError('Imagem corrompida ou ilegível'));
    });

    it('Dada imagem com pixels demais (bomba de descompressão), Quando recodificar, Então recusa sem decodificar', async () => {
      const bomb = await sharp({
        create: { width: 7000, height: 7000, channels: 3, background: '#fff' },
      })
        .png({ compressionLevel: 9 })
        .toBuffer();

      await expect(processor.toIdentityWebp(bomb)).rejects.toThrow(
        'Imagem corrompida ou ilegível',
      );
    });
  });
});
