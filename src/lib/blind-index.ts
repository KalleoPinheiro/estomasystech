import { createHash, createHmac, hkdfSync } from 'node:crypto';
import { normalizeCpf } from '@/domain/shared/cpf';
import { normalizeOptionalEmail } from '@/domain/shared/person-validation';
import { normalizeBrazilianPhoneOrThrow } from '@/domain/shared/phone';
import { logger } from '@/lib/observability/logger';

/**
 * Índice cego da PII cifrada (#734, ADR-096 na PR #805): permite achar um paciente por
 * CPF, telefone ou e-mail exatos sem decifrar a clínica inteira. O banco guarda
 * só o hash; o valor legível continua cifrado com a `DATA_ENCRYPTION_KEY`.
 *
 * - Chave: `BLIND_INDEX_PEPPER` (≥ 32 caracteres), separada da chave de dados
 *   para rotacionar e custodiar de forma independente; HKDF-SHA256 com info
 *   `estomasystech/blind-index/v1`.
 * - Hash: `HMAC-SHA256(chave, "<tipo>:<clinicId>:<valorNormalizado>")`. O
 *   `clinicId` impede correlacionar o mesmo CPF entre empresas (ADR-001) e o
 *   tipo impede que um telefone colida com um CPF.
 * - Valor guardado: `b1.<keyId>.<hex>`; `keyId` são 8 hex derivados do material
 *   do pepper, então a rotação não depende de numerar versões.
 *   `BLIND_INDEX_PEPPER_PREVIOUS` (lista por vírgula) só serve para achar
 *   hashes antigos durante a rotação; toda gravação usa o pepper atual.
 * - Vazio ou nulo não gera hash (`null`): nunca se indexa a string vazia.
 */

const HKDF_INFO = 'estomasystech/blind-index/v1';
export const MIN_BLIND_INDEX_PEPPER_LENGTH = 32;

export type BlindIndexKind = 'cpf' | 'phone' | 'email';

interface IndexKey {
  id: string;
  key: Buffer;
}

export function blindIndexKeyId(material: string): string {
  return createHash('sha256')
    .update(`estomasystech/blind-index-key-id:${material}`)
    .digest('hex')
    .slice(0, 8);
}

function deriveIndexKey(material: string): IndexKey {
  if (material.length < MIN_BLIND_INDEX_PEPPER_LENGTH) {
    throw new Error(
      `BLIND_INDEX_PEPPER com menos de ${MIN_BLIND_INDEX_PEPPER_LENGTH} caracteres — gere com: openssl rand -hex 32`,
    );
  }
  const key = Buffer.from(
    hkdfSync('sha256', material, Buffer.alloc(0), HKDF_INFO, 32),
  );
  return { id: blindIndexKeyId(material), key };
}

/**
 * Forma canônica antes do hash, com as regras do domínio: CPF só dígitos e
 * válido, telefone em E.164 brasileiro, e-mail aparado e em minúsculas.
 * Vazio vira `null`; valor preenchido e inválido lança `ValidationError`.
 */
export function normalizeForBlindIndex(
  kind: BlindIndexKind,
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  if (kind === 'cpf') return normalizeCpf(raw);
  if (kind === 'phone') return normalizeBrazilianPhoneOrThrow(raw);
  return normalizeOptionalEmail(raw);
}

export interface BlindIndexKeys {
  /** Material do pepper atual — gera todo hash gravado. */
  current: string;
  /** Peppers anteriores — só entram na busca durante a rotação. */
  previous?: readonly string[];
}

export class BlindIndex {
  private readonly current: IndexKey;
  private readonly previous: IndexKey[];

  constructor(keys: BlindIndexKeys) {
    this.current = deriveIndexKey(keys.current);
    const seen = new Set([this.current.id]);
    this.previous = [];
    for (const material of keys.previous ?? []) {
      const key = deriveIndexKey(material);
      if (seen.has(key.id)) continue;
      seen.add(key.id);
      this.previous.push(key);
    }
  }

  get currentKeyId(): string {
    return this.current.id;
  }

  /** Hash a gravar (pepper atual). `null` para valor vazio. */
  hash(
    clinicId: string,
    kind: BlindIndexKind,
    raw: string | null | undefined,
  ): string | null {
    const value = normalizeForBlindIndex(kind, raw);
    return value === null
      ? null
      : this.digest(this.current, clinicId, kind, value);
  }

  /**
   * Hashes a consultar: o atual primeiro e, na rotação, os dos peppers
   * anteriores. Lista vazia para valor vazio.
   */
  candidates(
    clinicId: string,
    kind: BlindIndexKind,
    raw: string | null | undefined,
  ): string[] {
    const value = normalizeForBlindIndex(kind, raw);
    if (value === null) return [];
    return [this.current, ...this.previous].map((key) =>
      this.digest(key, clinicId, kind, value),
    );
  }

  /** O hash guardado já usa o pepper atual? (o reindex pula) */
  isCurrent(stored: string): boolean {
    return stored.startsWith(`b1.${this.current.id}.`);
  }

  private digest(
    key: IndexKey,
    clinicId: string,
    kind: BlindIndexKind,
    value: string,
  ): string {
    const mac = createHmac('sha256', key.key)
      .update(`${kind}:${clinicId}:${value}`)
      .digest('hex');
    return `b1.${key.id}.${mac}`;
  }
}

const DEV_PEPPER_PREFIX = 'estomasystech-dev-only-blind-index:';

let warnedDevPepper = false;

/**
 * Índice cego a partir do ambiente. Em produção `BLIND_INDEX_PEPPER` é
 * obrigatório (falha fechada). Fora dela, sem a variável, deriva um pepper de
 * desenvolvimento do `AUTH_SECRET` (com aviso) — nunca usado em produção.
 * Lido só em runtime: o build não exige a variável.
 */
export function blindIndexFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): BlindIndex {
  const configured = env.BLIND_INDEX_PEPPER?.trim();
  const previous = (env.BLIND_INDEX_PEPPER_PREVIOUS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (configured) return new BlindIndex({ current: configured, previous });
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'BLIND_INDEX_PEPPER ausente — obrigatório em produção para buscar PII cifrada (gere com: openssl rand -hex 32)',
    );
  }
  const authSecret = env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error(
      'BLIND_INDEX_PEPPER e AUTH_SECRET ausentes — não há chave para o índice cego',
    );
  }
  if (!warnedDevPepper) {
    warnedDevPepper = true;
    logger.warn(
      '[config] BLIND_INDEX_PEPPER ausente: usando pepper de desenvolvimento derivado do AUTH_SECRET (nunca em produção).',
    );
  }
  return new BlindIndex({
    current: `${DEV_PEPPER_PREFIX}${authSecret}`,
    previous,
  });
}

/**
 * Boot em produção (`instrumentation.ts`): recusa subir sem o pepper ou com um
 * pepper curto. Fora de produção não exige nada (o índice deriva com aviso).
 */
export function assertBlindIndexConfigured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (env.NODE_ENV === 'production') blindIndexFromEnv(env);
}
