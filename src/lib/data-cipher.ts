import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { logger } from '@/lib/observability/logger';

/**
 * Cifra de dado clínico em repouso (#195, ADR-006) com chave própria,
 * separada do `AUTH_SECRET` da sessão.
 *
 * - Chave: `DATA_ENCRYPTION_KEY` (≥ 32 caracteres); AES-256-GCM com chave
 *   derivada por HKDF-SHA256 (info `vitta-flow/clinical-data/v1`).
 * - Payload: `v1.<keyId>.<iv>.<tag>.<ct>` — `keyId` são 8 hex derivados do
 *   material da chave, então a rotação não depende de o operador numerar
 *   versões. `DATA_ENCRYPTION_KEY_PREVIOUS` (lista separada por vírgula) só
 *   decifra; toda gravação usa a chave atual.
 * - Legado: payload `iv.tag.ct` (chave = sha256 do `AUTH_SECRET`, antes do
 *   #195) segue legível enquanto o `AUTH_SECRET` antigo estiver configurado;
 *   texto em claro (linha anterior à cifra) é devolvido como está. A recifra
 *   (`npm run data:reencrypt`) converte os dois para a chave atual.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const HKDF_INFO = 'vitta-flow/clinical-data/v1';
export const MIN_DATA_KEY_LENGTH = 32;

const B64 = '[A-Za-z0-9_-]';
/** iv (12 bytes) = 16 chars base64url; tag (16 bytes) = 22 chars. */
const V1_PAYLOAD = new RegExp(
  `^v1\\.([0-9a-f]{8})\\.(${B64}{16})\\.(${B64}{22})\\.(${B64}+)$`,
);
const LEGACY_PAYLOAD = new RegExp(`^(${B64}{16})\\.(${B64}{22})\\.(${B64}+)$`);

interface DataKey {
  id: string;
  key: Buffer;
}

export function dataKeyId(material: string): string {
  return createHash('sha256')
    .update(`vitta-flow/key-id:${material}`)
    .digest('hex')
    .slice(0, 8);
}

function deriveDataKey(material: string): DataKey {
  if (material.length < MIN_DATA_KEY_LENGTH) {
    throw new Error(
      `Chave de dados com menos de ${MIN_DATA_KEY_LENGTH} caracteres — gere com: openssl rand -hex 32`,
    );
  }
  const key = Buffer.from(
    hkdfSync('sha256', material, Buffer.alloc(0), HKDF_INFO, 32),
  );
  return { id: dataKeyId(material), key };
}

function seal(key: Buffer, plaintext: string): string[] {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const data = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data].map((part) =>
    part.toString('base64url'),
  );
}

function open(key: Buffer, iv: string, tag: string, data: string): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64url'),
    { authTagLength: AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export interface DataCipherKeys {
  /** Material da chave atual — cifra toda gravação. */
  current: string;
  /** Materiais anteriores — só decifram (rotação). */
  previous?: readonly string[];
  /** `AUTH_SECRET` que cifrava antes do #195 — só decifra o formato legado. */
  legacyAuthSecret?: string | null;
}

export class DataCipher {
  private readonly current: DataKey;
  private readonly byId: Map<string, DataKey>;
  private readonly legacyKey: Buffer | null;

  constructor(keys: DataCipherKeys) {
    this.current = deriveDataKey(keys.current);
    this.byId = new Map([[this.current.id, this.current]]);
    for (const material of keys.previous ?? []) {
      const key = deriveDataKey(material);
      if (!this.byId.has(key.id)) this.byId.set(key.id, key);
    }
    this.legacyKey = keys.legacyAuthSecret
      ? createHash('sha256').update(keys.legacyAuthSecret).digest()
      : null;
  }

  get currentKeyId(): string {
    return this.current.id;
  }

  encrypt(plaintext: string): string {
    // Texto vazio não tem o que proteger, e um payload sem ciphertext seria
    // indistinguível de texto em claro na leitura.
    if (plaintext === '') return '';
    return ['v1', this.current.id, ...seal(this.current.key, plaintext)].join(
      '.',
    );
  }

  decrypt(value: string): string {
    const v1 = V1_PAYLOAD.exec(value);
    if (v1) {
      const [, keyId, iv, tag, data] = v1;
      const key = this.byId.get(keyId);
      if (!key) {
        throw new Error(
          `Dado cifrado com chave desconhecida (id ${keyId}) — configure-a em DATA_ENCRYPTION_KEY_PREVIOUS`,
        );
      }
      return open(key.key, iv, tag, data);
    }
    const legacy = LEGACY_PAYLOAD.exec(value);
    if (legacy) {
      if (!this.legacyKey) {
        throw new Error(
          'Dado cifrado no formato anterior ao #195 e AUTH_SECRET antigo ausente',
        );
      }
      const [, iv, tag, data] = legacy;
      return open(this.legacyKey, iv, tag, data);
    }
    // Texto em claro gravado antes da cifra cobrir o campo (#195).
    return value;
  }

  /** Já está no formato atual, com a chave atual? (a recifra pula). */
  isCurrent(value: string): boolean {
    return V1_PAYLOAD.exec(value)?.[1] === this.current.id;
  }

  /** Null e vazio passam direto: não há conteúdo a proteger em "". */
  encryptNullable(value: string | null): string | null {
    return value === null || value === '' ? value : this.encrypt(value);
  }

  decryptNullable(value: string | null): string | null {
    return value === null || value === '' ? value : this.decrypt(value);
  }
}

export type FieldCipher = Pick<
  DataCipher,
  'encrypt' | 'decrypt' | 'encryptNullable' | 'decryptNullable' | 'isCurrent'
>;

const DEV_KEY_PREFIX = 'vitta-flow-dev-only-data-key:';

let warnedDevKey = false;

/**
 * Chaveiro a partir do ambiente. Em produção `DATA_ENCRYPTION_KEY` é
 * obrigatória. Fora dela, sem a variável, cai numa chave de desenvolvimento
 * derivada do `AUTH_SECRET` (com aviso) — nunca usada em produção.
 */
export function dataCipherFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DataCipher {
  const configured = env.DATA_ENCRYPTION_KEY?.trim();
  const previous = (env.DATA_ENCRYPTION_KEY_PREVIOUS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const legacyAuthSecret = env.AUTH_SECRET || null;
  if (configured) {
    return new DataCipher({ current: configured, previous, legacyAuthSecret });
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'DATA_ENCRYPTION_KEY ausente — obrigatória em produção para cifrar o prontuário (gere com: openssl rand -hex 32)',
    );
  }
  if (!legacyAuthSecret) {
    throw new Error(
      'DATA_ENCRYPTION_KEY e AUTH_SECRET ausentes — não há chave para o dado clínico',
    );
  }
  if (!warnedDevKey) {
    warnedDevKey = true;
    logger.warn(
      '[config] DATA_ENCRYPTION_KEY ausente: usando chave de desenvolvimento derivada do AUTH_SECRET (nunca em produção).',
    );
  }
  return new DataCipher({
    current: `${DEV_KEY_PREFIX}${legacyAuthSecret}`,
    previous,
    legacyAuthSecret,
  });
}
