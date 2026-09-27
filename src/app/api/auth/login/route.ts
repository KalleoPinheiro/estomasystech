import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { startMfaLogin } from '@/application/auth/mfa-login';
import { suspendedClinicMessage } from '@/application/auth/suspended-clinic-message';
import type { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import type { Clinic } from '@/domain/clinic/clinic';
import { currentDataCipher, getRepositories } from '@/infrastructure/container';
import { fail, ok } from '@/lib/api-response';
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
    // do que a própria resposta HTTP já revela (AC-02). A clínica suspensa só
    // chega aqui com a senha provada, e o evento fica com a conta (B5).
    await recordAuditNow(auditEvents, null, {
      action: 'read',
      resourceType: 'session',
      resourceId: parsed.data.email,
      detail: identity.auditDetail ?? 'invalid_credentials',
      actorOverride: deniedActor(identity.deniedAccount, parsed.data.email),
    });
    return fail(identity.error, identity.status);
  }

  const mfaRequired = identity.role === 'super_admin';
  await recordAuditNow(auditEvents, null, {
    action: 'read',
    resourceType: 'session',
    resourceId: identity.subject,
    // Senha aceita não é sessão para o super_admin: falta o segundo fator.
    detail: mfaRequired ? 'mfa_required' : null,
    actorOverride: {
      role: identity.role,
      id: identity.subject,
      clinicId: identity.clinicId,
    },
  });

  if (mfaRequired) {
    return ok(await superAdminPendingLogin(auth.secret, identity.account));
  }

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
      identity.sessionVersion,
    ),
    sessionCookieOptions(),
  );
  return response;
}

/**
 * Ator do evento de login recusado: anônimo, salvo quando a conta provou a
 * senha e foi barrada pela clínica suspensa — aí o evento é dela, na clínica.
 */
function deniedActor(account: UserAccount | undefined, email: string) {
  return account
    ? { role: account.role, id: account.email, clinicId: account.clinicId }
    : { role: 'anonymous' as const, id: email, clinicId: null };
}

type AuthResult =
  | {
      account: UserAccount;
      subject: string;
      role: UserRole;
      clinicId: string | null;
      professionalId: string | null;
      sessionVersion: number;
    }
  | {
      error: string;
      status: number;
      auditDetail?: string;
      /** Conta que provou a senha mas foi barrada (clínica suspensa, B5). */
      deniedAccount?: UserAccount;
    };

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
  // Clínica suspensa (B5): a conta sai das candidatas. Só quem provou a senha
  // chega aqui, então a suspensão nunca revela a existência do e-mail.
  const { usable, suspended } = await splitBySuspendedClinic(matches);
  if (usable.length === 0) {
    const [denied] = suspended;
    return {
      error: suspendedClinicMessage(denied.account.role, denied.clinic),
      status: 403,
      auditDetail: 'clinic_suspended',
      deniedAccount: denied.account,
    };
  }
  return singleAccountResult(usable);
}

function singleAccountResult(matches: UserAccount[]): AuthResult {
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
    account,
    subject: account.email,
    role: account.role,
    clinicId: account.clinicId,
    professionalId: account.professionalId,
    // Versão vigente (#194): logout/troca de senha posteriores revogam este token.
    sessionVersion: account.sessionVersion,
  };
}

/** Separa as contas de clínica suspensa, guardando a clínica para a mensagem. */
async function splitBySuspendedClinic(accounts: UserAccount[]): Promise<{
  usable: UserAccount[];
  suspended: { account: UserAccount; clinic: Clinic }[];
}> {
  const { clinics } = await getRepositories(systemScope());
  const usable: UserAccount[] = [];
  const suspended: { account: UserAccount; clinic: Clinic }[] = [];
  for (const account of accounts) {
    const clinic = account.clinicId
      ? await clinics.findById(account.clinicId)
      : null;
    if (clinic?.isSuspended) suspended.push({ account, clinic });
    else usable.push(account);
  }
  return { usable, suspended };
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

/**
 * Super_admin (ADR-007, bloco B2): a senha rende só um token pendente de 5
 * min — `mfaRequired` com fator cadastrado, `mfaEnrollmentRequired` sem ele.
 * Nunca existe sessão de super_admin sem segundo fator.
 */
async function superAdminPendingLogin(
  authSecret: string,
  account: UserAccount,
) {
  const { userAccounts, mfa } = await getRepositories(systemScope());
  return startMfaLogin(
    {
      userAccounts,
      mfa,
      cipher: currentDataCipher(),
      authSecret,
      nowMs: Date.now(),
    },
    account,
  );
}
