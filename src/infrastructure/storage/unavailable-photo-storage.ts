import type { PhotoStorage } from '@/application/ports/photo-storage';

export const VERCEL_REQUIRES_S3_MESSAGE =
  'Na Vercel as fotos clínicas exigem PHOTO_STORAGE=s3 — o disco das funções é efêmero e a foto se perderia (docs/engineering/producao.md)';

/**
 * Armazenamento de fotos recusado (#206): na Vercel, sem bucket configurado,
 * gravar em disco perderia a foto clínica. Falha no uso, não na montagem — os
 * serviços são montados a cada requisição e o resto do sistema (login, agenda)
 * continua funcionando.
 */
export class UnavailablePhotoStorage implements PhotoStorage {
  constructor(private readonly reason: string) {}

  async write(): Promise<void> {
    throw new Error(this.reason);
  }

  async read(): Promise<Uint8Array | null> {
    throw new Error(this.reason);
  }

  async remove(): Promise<void> {
    throw new Error(this.reason);
  }
}

/** A Vercel define `VERCEL=1` em build e em runtime. */
export const isVercelRuntime = (env: NodeJS.ProcessEnv = process.env) =>
  Boolean(env.VERCEL);

/** O armazenamento recusa tudo? (logo e avatar ficam desabilitados com aviso, #427) */
export const isPhotoStorageAvailable = (storage: PhotoStorage): boolean =>
  !(storage instanceof UnavailablePhotoStorage);
