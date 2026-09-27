import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPhotoStorage } from '@/infrastructure/container';
import { LocalPhotoStorage } from '@/infrastructure/storage/local-photo-storage';
import { S3PhotoStorage } from '@/infrastructure/storage/s3-photo-storage';
import { VERCEL_REQUIRES_S3_MESSAGE } from '@/infrastructure/storage/unavailable-photo-storage';

describe('Feature: escolha do armazenamento de fotos (#206)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('vercel requires s3: na Vercel sem PHOTO_STORAGE=s3, gravar e ler foto lança', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('PHOTO_STORAGE', '');

    const storage = buildPhotoStorage('clinica-a');

    await expect(storage.write('foto', new Uint8Array([1]))).rejects.toThrow(
      VERCEL_REQUIRES_S3_MESSAGE,
    );
    await expect(storage.read('foto')).rejects.toThrow('PHOTO_STORAGE=s3');
    await expect(storage.remove('foto')).rejects.toThrow('PHOTO_STORAGE=s3');
  });

  it('na Vercel com bucket usa S3; fora dela sem bucket segue o disco local', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('PHOTO_STORAGE', 's3');
    vi.stubEnv('S3_BUCKET', 'b');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'a');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 's');
    expect(buildPhotoStorage('clinica-a')).toBeInstanceOf(S3PhotoStorage);

    vi.stubEnv('VERCEL', '');
    vi.stubEnv('PHOTO_STORAGE', '');
    expect(buildPhotoStorage('clinica-a')).toBeInstanceOf(LocalPhotoStorage);
  });
});
