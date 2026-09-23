import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { getRepositories } from '@/infrastructure/container';
import { fail } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import { verifyPassword } from '@/lib/auth/password';
import { SharedRateLimiter } from '@/lib/auth/rate-limit';
import {
  createSessionToken,
  getAuthConfig,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { systemScope } from '@/lib/auth/tenant-scope';

const LOGIN_RATE_LIMIT = new SharedRateLimiter('login', 5, 60_000);

/**
 * Único caminho de login desde a ADR-004: e-mail + senha da própria conta.
 * `email` é obrigatório — não existe mais senha mestre nem login por Google.
 */
const loginSchema = z.object({
  email: z.string().min(3).max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!(await LOGIN_RATE_LIMIT.allow(ip))) {
    return fail('Muitas tentativas de login, aguarde um minuto', 429);
  }

  const auth = getAuthConfig();
  if (!auth) {
    return fail('Autenticação não configurada no servidor', 503);
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('Credenciais inválidas', 401);
  }

  const { auditEvents } = await getRepositories(systemScope());
  const identity = await authenticateAccount(
    parsed.data.email,
    parsed.data.password,
  );
  if ('error' in identity) {
    // Ator anônimo pré-sessão: nunca revela no evento se a conta existe além
    // do que a própria resposta HTTP já revela (AC-02).
    await recordAuditNow(auditEvents, null, {
      action: 'read',
      resourceType: 'session',
      resourceId: parsed.data.email,
      detail: identity.auditDetail ?? 'invalid_credentials',
      actorOverride: {
        role: 'anonymous',
        id: parsed.data.email,
        clinicId: null,
      },
    });
    return fail(identity.error, identity.status);
  }

  await recordAuditNow(auditEvents, null, {
    action: 'read',
    resourceType: 'session',
    resourceId: identity.subject,
    actorOverride: {
      role: identity.role,
      id: identity.subject,
      clinicId: identity.clinicId,
    },
  });

  const expiresAtMs = Date.now() + SESSION_TTL_MS;
  const response = NextResponse.json({
    success: true,
    data: { ok: true },
    error: null,
  });
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(
      auth.secret,
      expiresAtMs,
      identity.subject,
      identity.role,
      identity.clinicId,
      identity.professionalId,
    ),
    sessionCookieOptions(),
  );
  return response;
}

type AuthResult =
  | {
      subject: string;
      role: UserRole;
      clinicId: string | null;
      professionalId: string | null;
    }
  | { error: string; status: number; auditDetail?: string };

async function authenticateAccount(
  email: string,
  password: string,
): Promise<AuthResult> {
  const { userAccounts } = await getRepositories(systemScope());
  // MT-06/ADR-003 permite o mesmo e-mail em clínicas diferentes, então mais de
  // uma conta ativa pode bater aqui — a senha é o critério que desambigua
  // entre elas (issue #125; findByEmail + LIMIT 1 pegava uma linha arbitrária).
  const candidates = (await userAccounts.findAllByEmail(email)).filter(
    (account) => account.isActive,
  );
  const matches = await filterByValidPassword(candidates, password);

  if (matches.length === 0) {
    return { error: 'Email ou senha incorretos', status: 401 };
  }
  if (matches.length > 1) {
    return {
      error: 'Email ou senha incorretos',
      status: 401,
      auditDetail: 'ambiguous_credentials',
    };
  }
  const account = matches[0];
  // O papel e a empresa vêm sempre da própria conta — nunca um valor fixo por
  // padrão (fix do bug "senha sempre vira admin", RBAC-02/RBAC-04).
  return {
    subject: account.email,
    role: account.role,
    clinicId: account.clinicId,
    professionalId: account.professionalId,
  };
}

// hazard: 1 scrypt call por candidata, em paralelo. Response time cresce com
// candidates.length além do threadpool do libuv (default 4) — vaza pra quem
// mede timing quantas clínicas compartilham um e-mail. Aceito: caso raro
// (colisão de e-mail entre clínicas já é exceção), mitigado pelo rate limit
// de 5/min por IP. Não bloqueia auth, só metadado de contagem de tenants.
async function filterByValidPassword(
  candidates: UserAccount[],
  password: string,
): Promise<UserAccount[]> {
  const checks = await Promise.all(
    candidates.map((account) => verifyPassword(password, account.passwordHash)),
  );
  return candidates.filter((_, index) => checks[index]);
}
