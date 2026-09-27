import { NextResponse } from 'next/server';
import type { MfaDeps } from '@/application/auth/mfa-login';
import type { UserAccount } from '@/domain/auth/user-account';
import { currentDataCipher, getRepositories } from '@/infrastructure/container';
import { recordAuditNow } from '@/lib/audit';
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { systemScope } from '@/lib/auth/tenant-scope';

/**
 * Montagem comum das rotas do segundo fator (ADR-007, bloco B2). Escopo de
 * sistema: tudo acontece antes de existir sessão, e o token pendente é que
 * identifica a conta — o super_admin, que não tem clínica.
 */
export async function mfaContext(authSecret: string) {
  const services = await getRepositories(systemScope());
  const deps: MfaDeps = {
    userAccounts: services.userAccounts,
    mfa: services.mfa,
    cipher: currentDataCipher(),
    authSecret,
    nowMs: Date.now(),
  };
  const audit = (account: UserAccount, detail: string) =>
    recordAuditNow(services.auditEvents, null, {
      action: 'read',
      resourceType: 'session',
      resourceId: account.email,
      detail,
      actorOverride: {
        role: account.role,
        id: account.email,
        clinicId: account.clinicId,
      },
    });
  return { deps, audit };
}

/** Resposta com o cookie de sessão — só depois do segundo fator. */
export function sessionResponse<T>(
  authSecret: string,
  account: UserAccount,
  sessionVersion: number,
  data: T,
): NextResponse {
  const response = NextResponse.json({ success: true, data, error: null });
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(
      authSecret,
      Date.now() + SESSION_TTL_MS,
      account.email,
      account.role,
      account.clinicId,
      account.professionalId,
      sessionVersion,
    ),
    sessionCookieOptions(),
  );
  return response;
}
