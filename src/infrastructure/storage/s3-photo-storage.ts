import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { PhotoStorage } from '@/application/ports/photo-storage';

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface S3PhotoStorageConfig {
  bucket: string;
  region: string;
  /** Endpoint S3-compatível (R2, MinIO…); ausente = AWS S3. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** Subconjunto do `S3Client` usado aqui — permite injetar um falso nos testes. */
export interface S3Sender {
  send(command: object): Promise<unknown>;
}

const REQUIRED_ENV = [
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

/**
 * `PHOTO_STORAGE=s3` liga o armazenamento compartilhado entre réplicas; sem
 * isso, fotos seguem no disco local. Com `s3` ligado e variável faltando, falha
 * na montagem com erro explícito — nunca grava foto clínica em disco efêmero
 * por engano.
 */
export function s3PhotoStorageConfigFromEnv(): S3PhotoStorageConfig | null {
  if (process.env.PHOTO_STORAGE !== 's3') {
    return null;
  }
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `PHOTO_STORAGE=s3 exige ${missing.join(', ')} — configure ou remova PHOTO_STORAGE`,
    );
  }
  return {
    bucket: process.env.S3_BUCKET as string,
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
}

export function createS3Client(config: S3PhotoStorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

const isNotFound = (error: unknown): boolean => {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
};

/**
 * Fotos clínicas num bucket S3-compatível (AWS S3, Cloudflare R2, MinIO),
 * compartilhado entre réplicas. A chave espelha o caminho do disco local
 * (`<clinicId>/condition-photos/<id>`), então migrar é copiar a pasta
 * `uploads/` para o bucket. O bucket deve ser privado: as fotos só saem pela
 * API, que confere sessão e empresa.
 */
export class S3PhotoStorage implements PhotoStorage {
  private readonly prefix: string;

  constructor(
    private readonly client: S3Sender,
    private readonly bucket: string,
    clinicId: string,
  ) {
    if (!ID_PATTERN.test(clinicId)) {
      throw new Error('Identificador de clínica inválido');
    }
    this.prefix = `${clinicId}/condition-photos/`;
  }

  private keyFor(id: string): string {
    if (!ID_PATTERN.test(id)) {
      throw new Error('Identificador de foto inválido');
    }
    return `${this.prefix}${id}`;
  }

  async write(id: string, data: Uint8Array): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(id),
        Body: data,
      }),
    );
  }

  async read(id: string): Promise<Uint8Array | null> {
    try {
      const output = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.keyFor(id) }),
      )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
      return output.Body ? await output.Body.transformToByteArray() : null;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.keyFor(id) }),
    );
  }
}
