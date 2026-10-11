import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de login pendente do segundo fator (ADR-008, ADR-012): prova que a
 * senha foi aceita há menos de 5 min e diz qual etapa do segundo fator falta.
 * Nunca é sessão — a chave do HMAC é derivada do `AUTH_SECRET` com um rótulo
 * próprio, então um token não passa pelo outro.
 */
export const MFA_PENDING_TTL_MS = 5 * 60 * 1000;
const PREFIX = 'mfa.';
const KEY_LABEL = 'vitta-flow/mfa-pending/v1';

/** `verify`: falta o código; `enroll`: falta cadastrar; `confirm`: falta confirmar a chave nova. */
export type MfaStage = 'verify' | 'enroll' | 'confirm';
const STAGES: readonly MfaStage[] = ['verify', 'enroll', 'confirm'];

export interface MfaPendingToken {
  accountId: string;
  sessionVersion: number;
  stage: MfaStage;
  expiresAtMs: number;
  /** Só na etapa `confirm`: chave nova, cifrada com a chave de dados (ADR-006). */
  encryptedSecret?: string;
}

const signingKey = (secret: string): Buffer =>
  createHmac('sha256', secret).update(KEY_LABEL).digest();

const sign = (secret: string, payload: string): string =>
  createHmac('sha256', signingKey(secret)).update(payload).digest('hex');

export function createMfaPendingToken(
  secret: string,
  token: Omit<MfaPendingToken, 'expiresAtMs'>,
  nowMs: number = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      p: 'mfa',
      sub: token.accountId,
      sv: token.sessionVersion,
      st: token.stage,
      exp: nowMs + MFA_PENDING_TTL_MS,
      ...(token.encryptedSecret ? { sec: token.encryptedSecret } : {}),
    }),
  ).toString('base64url');
  return `${PREFIX}${payload}.${sign(secret, payload)}`;
}

function hasValidSignature(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  const expected = Buffer.from(sign(secret, payload));
  const provided = Buffer.from(signature);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

interface RawPayload {
  p?: unknown;
  sub?: unknown;
  sv?: unknown;
  st?: unknown;
  exp?: unknown;
  sec?: unknown;
}

function toToken(raw: RawPayload): MfaPendingToken | null {
  const valid =
    raw.p === 'mfa' &&
    typeof raw.sub === 'string' &&
    Number.isSafeInteger(raw.sv) &&
    typeof raw.exp === 'number' &&
    STAGES.includes(raw.st as MfaStage) &&
    (raw.sec === undefined || typeof raw.sec === 'string');
  if (!valid) return null;
  return {
    accountId: raw.sub as string,
    sessionVersion: raw.sv as number,
    stage: raw.st as MfaStage,
    expiresAtMs: raw.exp as number,
    ...(typeof raw.sec === 'string' ? { encryptedSecret: raw.sec } : {}),
  };
}

export function verifyMfaPendingToken(
  secret: string,
  value: string | undefined,
  nowMs: number = Date.now(),
): MfaPendingToken | null {
  if (!value?.startsWith(PREFIX)) return null;
  const body = value.slice(PREFIX.length);
  const separator = body.indexOf('.');
  if (separator <= 0) return null;
  const payload = body.slice(0, separator);
  if (!hasValidSignature(secret, payload, body.slice(separator + 1))) {
    return null;
  }
  try {
    const token = toToken(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
    return token && token.expiresAtMs > nowMs ? token : null;
  } catch {
    return null;
  }
}
