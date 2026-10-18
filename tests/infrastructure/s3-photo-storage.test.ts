import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createS3Client,
  S3PhotoStorage,
  type S3Sender,
  s3PhotoStorageConfigFromEnv,
} from '@/infrastructure/storage/s3-photo-storage';
import { systemScope } from '@/lib/auth/tenant-scope';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

type Command = { input: Record<string, unknown> };

/** Bucket em memória que responde como o S3 (NoSuchKey quando falta). */
function fakeBucket() {
  const objects = new Map<string, Uint8Array>();
  const sent: Command[] = [];
  const client: S3Sender = {
    send: vi.fn(async (command: object) => {
      const { input } = command as Command;
      sent.push(command as Command);
      const key = `${input.Bucket}/${input.Key}`;
      if (command instanceof PutObjectCommand) {
        objects.set(key, input.Body as Uint8Array);
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const data = objects.get(key);
        if (!data) {
          throw Object.assign(new Error('not found'), { name: 'NoSuchKey' });
        }
        return { Body: { transformToByteArray: async () => data } };
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(key);
        return {};
      }
      throw new Error('comando inesperado');
    }),
  };
  return { client, objects, sent };
}

const S3_ENV = {
  PHOTO_STORAGE: 's3',
  S3_BUCKET: 'estomasystech-fotos',
  S3_ACCESS_KEY_ID: 'AKIA-TESTE',
  S3_SECRET_ACCESS_KEY: 'segredo-teste',
};

describe('Feature: Fotos clínicas em bucket S3-compatível', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('S3PhotoStorage', () => {
    it('Dada uma foto gravada, Quando ler, Então devolve os mesmos bytes; após remover, null', async () => {
      const { client, objects } = fakeBucket();
      const storage = new S3PhotoStorage(
        client,
        'estomasystech-fotos',
        'clinica-a',
      );
      const bytes = new Uint8Array([1, 2, 3]);

      await storage.write('foto-1', bytes);
      expect([...objects.keys()]).toEqual([
        'estomasystech-fotos/clinica-a/condition-photos/foto-1',
      ]);
      expect(await storage.read('foto-1')).toEqual(bytes);

      await storage.remove('foto-1');
      expect(await storage.read('foto-1')).toBeNull();
    });

    it('Dadas duas clínicas, Então cada uma só enxerga as próprias fotos (chave por clínica)', async () => {
      const { client } = fakeBucket();
      await new S3PhotoStorage(client, 'b', 'clinica-a').write(
        'foto-1',
        new Uint8Array([9]),
      );

      expect(
        await new S3PhotoStorage(client, 'b', 'clinica-b').read('foto-1'),
      ).toBeNull();
    });

    it('Dado id ou clínica com caracteres de caminho, Então recusa sem chamar o bucket', async () => {
      const { client, sent } = fakeBucket();
      expect(() => new S3PhotoStorage(client, 'b', '../outra')).toThrow(
        'Identificador de clínica inválido',
      );
      const storage = new S3PhotoStorage(client, 'b', 'clinica-a');

      await expect(storage.read('../../x')).rejects.toThrow(
        'Identificador de foto inválido',
      );
      expect(sent).toEqual([]);
    });

    it('Dado 404 sem o nome NoSuchKey, Então também devolve null; outros erros propagam', async () => {
      const notFound: S3Sender = {
        send: vi.fn().mockRejectedValue({ $metadata: { httpStatusCode: 404 } }),
      };
      const denied: S3Sender = {
        send: vi.fn().mockRejectedValue(new Error('AccessDenied')),
      };

      expect(
        await new S3PhotoStorage(notFound, 'b', 'c').read('foto'),
      ).toBeNull();
      await expect(
        new S3PhotoStorage(denied, 'b', 'c').read('foto'),
      ).rejects.toThrow('AccessDenied');
    });

    it('Dada resposta sem corpo, Então devolve null', async () => {
      const empty: S3Sender = { send: vi.fn().mockResolvedValue({}) };

      expect(await new S3PhotoStorage(empty, 'b', 'c').read('foto')).toBeNull();
    });
  });

  describe('Configuração pelo ambiente', () => {
    it('server side encryption: upload leva AES256 por padrão, aws:kms quando pedido e nada com provider (#195)', async () => {
      const put = async (sse?: 'AES256' | 'aws:kms' | null) => {
        const { client, sent } = fakeBucket();
        const storage =
          sse === undefined
            ? new S3PhotoStorage(client, 'b', 'c')
            : new S3PhotoStorage(client, 'b', 'c', sse);
        await storage.write('foto', new Uint8Array([1]));
        return sent[0].input;
      };

      expect((await put()).ServerSideEncryption).toBe('AES256');
      expect((await put('aws:kms')).ServerSideEncryption).toBe('aws:kms');
      expect(await put(null)).not.toHaveProperty('ServerSideEncryption');

      Object.assign(process.env, S3_ENV);
      for (const [value, expected] of [
        [undefined, 'AES256'],
        ['aws:kms', 'aws:kms'],
        ['provider', null],
      ] as const) {
        if (value === undefined) delete process.env.S3_SSE;
        else process.env.S3_SSE = value;
        expect(s3PhotoStorageConfigFromEnv()?.serverSideEncryption).toBe(
          expected,
        );
      }
      process.env.S3_SSE = 'nenhum';
      expect(() => s3PhotoStorageConfigFromEnv()).toThrow('S3_SSE inválido');
    });

    it('Sem PHOTO_STORAGE=s3, Então não há configuração (disco local)', () => {
      delete process.env.PHOTO_STORAGE;
      expect(s3PhotoStorageConfigFromEnv()).toBeNull();
    });

    it('Com PHOTO_STORAGE=s3 completo, Então lê bucket, região, endpoint e path-style', () => {
      Object.assign(process.env, S3_ENV, {
        S3_REGION: 'us-east-1',
        S3_ENDPOINT: 'http://minio:9000',
        S3_FORCE_PATH_STYLE: 'true',
      });

      expect(s3PhotoStorageConfigFromEnv()).toEqual({
        bucket: 'estomasystech-fotos',
        region: 'us-east-1',
        endpoint: 'http://minio:9000',
        accessKeyId: 'AKIA-TESTE',
        secretAccessKey: 'segredo-teste',
        forcePathStyle: true,
        serverSideEncryption: 'AES256',
      });
    });

    it('Com PHOTO_STORAGE=s3 mínimo, Então região auto, sem endpoint e sem path-style', () => {
      Object.assign(process.env, S3_ENV);
      delete process.env.S3_REGION;
      delete process.env.S3_ENDPOINT;
      delete process.env.S3_FORCE_PATH_STYLE;

      expect(s3PhotoStorageConfigFromEnv()).toMatchObject({
        region: 'auto',
        endpoint: undefined,
        forcePathStyle: false,
      });
    });

    it('Com PHOTO_STORAGE=s3 e variável faltando, Então falha dizendo qual', () => {
      Object.assign(process.env, S3_ENV);
      delete process.env.S3_SECRET_ACCESS_KEY;

      expect(() => s3PhotoStorageConfigFromEnv()).toThrow(
        'PHOTO_STORAGE=s3 exige S3_SECRET_ACCESS_KEY',
      );
    });

    it('Dada configuração, Então monta o cliente S3 com endpoint e região', async () => {
      const client = createS3Client({
        bucket: 'b',
        region: 'auto',
        endpoint: 'https://conta.r2.cloudflarestorage.com',
        accessKeyId: 'a',
        secretAccessKey: 's',
        forcePathStyle: false,
        serverSideEncryption: 'AES256',
      });

      expect(await client.config.region()).toBe('auto');
    });
  });

  describe('Container', () => {
    it('Com PHOTO_STORAGE=s3, Então os serviços usam o bucket; sem, o disco local', async () => {
      const { getRepositories } = await import('@/infrastructure/container');
      delete process.env.PHOTO_STORAGE;
      expect(
        (await getRepositories(systemScope())).photoStorage.constructor.name,
      ).toBe('LocalPhotoStorage');

      Object.assign(process.env, S3_ENV);
      expect(
        (await getRepositories(systemScope())).photoStorage.constructor.name,
      ).toBe('S3PhotoStorage');
    });
  });
});
