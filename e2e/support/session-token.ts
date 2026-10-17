import { createHmac } from "node:crypto";
import { E2E_AUTH_SECRET, SESSION_COOKIE_NAME } from "./constants";

/**
 * Réplica exata da assinatura de `src/lib/auth/session.ts` (`createSessionToken`).
 * Não importamos o módulo real porque ele vive em `src/` (código da app, roda no
 * processo Next) e depende de `next/server` em alguns caminhos vizinhos — replicar
 * o algoritmo aqui (HMAC-SHA256 sobre payload base64url) mantém o E2E desacoplado
 * do processo do servidor e evita puxar a árvore de imports da app para o test
 * runner. Qualquer mudança no algoritmo de assinatura em `session.ts` precisa ser
 * espelhada aqui.
 */
export type UserRole =
  | "super_admin"
  | "company_admin"
  | "atendente"
  | "profissional"
  | "patient"
  | "partner"
  | "guardian";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Espelha `LEGACY_CLINIC_ID` (src/infrastructure/persistence/drizzle/legacy-clinic.ts). */
const LEGACY_CLINIC_ID = "legacy-clinic";

export function mintSessionToken(
  subject: string,
  role: UserRole,
  secret: string = E2E_AUTH_SECRET,
  ttlMs: number = SESSION_TTL_MS,
  clinicId: string | null = LEGACY_CLINIC_ID,
): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + ttlMs, sub: subject, role, clinicId }),
  ).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

interface CookieForContext {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax";
  expires: number;
}

/** Cookie pronto para `browserContext.addCookies([...])`. */
export function sessionCookie(
  subject: string,
  role: UserRole,
  host = "localhost",
  clinicId: string | null = LEGACY_CLINIC_ID,
): CookieForContext {
  return {
    name: SESSION_COOKIE_NAME,
    value: mintSessionToken(subject, role, undefined, undefined, clinicId),
    domain: host,
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
    expires: Math.floor((Date.now() + SESSION_TTL_MS) / 1000),
  };
}
