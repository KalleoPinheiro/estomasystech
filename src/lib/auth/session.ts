import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'estomasystech_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Atributos padrão do cookie de sessão (única fonte para login por senha e OAuth). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

const sign = (secret: string, payload: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex');

import { USER_ROLES, type UserRole } from '@/domain/auth/user-role';

export type { UserRole };
export { USER_ROLES };

export interface Session {
  expiresAtMs: number;
  /** Quem está logado: "local" (senha da clínica) ou o email da conta Google. */
  subject: string;
  /** Papel de acesso — um dos 6 valores do catálogo (ADR-003). */
  role: UserRole;
  /** Empresa da sessão; `null` só no papel de sistema (acesso cross-empresa). */
  clinicId: string | null;
  /** Profissional vinculado à conta (só quando role === "profissional"), para o escopo dinâmico do R4. */
  professionalId: string | null;
  /**
   * Versão das sessões da conta no momento do login (#194, ADR-005). Ausente
   * em token antigo = 0. Diferente de `user_accounts.session_version` = revogada.
   */
  sessionVersion?: number;
}

export function createSessionToken(
  secret: string,
  expiresAtMs: number,
  subject = 'local',
  role: UserRole = 'company_admin',
  clinicId: string | null = null,
  professionalId: string | null = null,
  sessionVersion = 0,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      exp: expiresAtMs,
      sub: subject,
      role,
      clinicId,
      professionalId,
      sv: sessionVersion,
    }),
  ).toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
}

function hasValidSignature(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  const expectedBuffer = Buffer.from(sign(secret, payload));
  const signatureBuffer = Buffer.from(signature);
  return (
    signatureBuffer.length === expectedBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedBuffer)
  );
}

/** Nulo/ausente é válido (compat com tokens antigos); string é o único outro valor aceito. */
function isNullableString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === 'string';
}

function parsePayload(payload: string): Session | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as {
      exp?: unknown;
      sub?: unknown;
      role?: unknown;
      clinicId?: unknown;
      professionalId?: unknown;
      sv?: unknown;
    };
    if (typeof parsed.exp !== 'number' || typeof parsed.sub !== 'string') {
      return null;
    }
    if (!USER_ROLES.includes(parsed.role as UserRole)) {
      return null;
    }
    if (
      !isNullableString(parsed.clinicId) ||
      !isNullableString(parsed.professionalId)
    ) {
      return null;
    }
    // Token anterior ao #194 não tem `sv`: vale como versão 0.
    const sessionVersion = parsed.sv ?? 0;
    if (
      !Number.isSafeInteger(sessionVersion) ||
      (sessionVersion as number) < 0
    ) {
      return null;
    }
    return {
      expiresAtMs: parsed.exp,
      subject: parsed.sub,
      role: parsed.role as UserRole,
      clinicId: parsed.clinicId ?? null,
      professionalId:
        (parsed.professionalId as string | null | undefined) ?? null,
      sessionVersion: sessionVersion as number,
    };
  } catch {
    return null;
  }
}

export function verifySessionToken(
  secret: string,
  token: string | undefined,
  nowMs: number = Date.now(),
): Session | null {
  if (!token) {
    return null;
  }
  const separator = token.indexOf('.');
  if (separator <= 0) {
    return null;
  }
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!hasValidSignature(secret, payload, signature)) {
    return null;
  }
  const session = parsePayload(payload);
  return session && session.expiresAtMs > nowMs ? session : null;
}

export interface AuthConfig {
  /** Segredo de assinatura da sessão — única variável que a autenticação exige. */
  secret: string;
}

/**
 * Não existe mais senha mestre (ADR-004): toda credencial vive em
 * `user_accounts`, e a configuração de autenticação se resume ao segredo que
 * assina o cookie de sessão.
 */
export function getAuthConfig(): AuthConfig | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return null;
  }
  return { secret };
}

/** Comparação de segredo em tempo constante (evita timing attack). */
export function passwordMatches(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
