import type { NextRequest, NextResponse } from 'next/server';
import type { UserAccount } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { fail } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import {
  createSessionToken,
  getAuthConfig,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type Session,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';

type Services = Awaited<ReturnType<typeof getRepositories>>;

export type OwnAccountGuard =
  | {
      ok: true;
      session: Session;
      account: UserAccount;
      services: Services;
      authSecret: string;
    }
  | { ok: false; response: NextResponse };

/**
 * Guarda das rotas de "Minha conta" (#295): sessão de equipe de uma conta
 * real, ativa, lida pelo e-mail da sessão na empresa dela. Modo aberto de dev
 * (sem sessão) e conta ausente não têm "minha conta".
 */
export async function requireOwnAccount(
  request: NextRequest,
): Promise<OwnAccountGuard> {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard;
  const auth = getAuthConfig();
  if (!guard.session || !auth) {
    return {
      ok: false,
      response: fail('Minha conta exige uma conta autenticada', 403),
    };
  }
  const services = await getRepositories(sessionScope(guard.session));
  const account = await services.userAccounts.findByEmail(
    guard.session.subject,
  );
  if (!account?.isActive) {
    return { ok: false, response: fail('Conta não encontrada', 404) };
  }
  return {
    ok: true,
    session: guard.session,
    account,
    services,
    authSecret: auth.secret,
  };
}

/**
 * Renova o cookie da sessão atual com a `session_version` nova: a troca de
 * senha (e o cadastro do 2º fator) derruba as outras sessões, não a de quem
 * acabou de fazê-la.
 */
export function withRenewedSession(
  response: NextResponse,
  authSecret: string,
  account: UserAccount,
  sessionVersion: number,
): NextResponse {
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
