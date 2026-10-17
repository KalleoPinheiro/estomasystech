import type { NextRequest, NextResponse } from 'next/server';
import type { UserRole } from '@/domain/auth/user-role';
import { fail } from '@/lib/api-response';
import {
  AUTH_NOT_CONFIGURED_MESSAGE,
  isAllowedForRole,
  ROLE_FAMILY_DENIED_MESSAGE,
  resolveAuthMode,
  STAFF_ONLY_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from './access-policy';
import { getRequestSession } from './request-session';
import type { Session } from './session';
import { isStaffRole } from './staff-roles';

/**
 * Camada 2 de autorização: guarda executada DENTRO de cada route handler.
 *
 * O proxy (`src/proxy.ts`) já barra a requisição na borda, mas a própria doc do
 * Next 16 diz que ele é uma checagem otimista e não deve ser a única barreira.
 * Esta guarda garante que a rota se recusa a executar sem sessão mesmo se o
 * `matcher` do proxy for alterado, se a rota for chamada fora do pipeline HTTP
 * (teste, script, RPC interno) ou se um handler novo nascer num grupo liberado.
 *
 * Uso — sempre a PRIMEIRA instrução do handler, antes de ler `params` ou tocar
 * o banco:
 *
 *   export async function POST(request: NextRequest) {
 *     const guard = requireStaffSession(request);
 *     if (!guard.ok) return guard.response;
 *     ...
 *   }
 */
export type Guard<S> =
  | { ok: true; session: S }
  | { ok: false; response: NextResponse };

const denied = (message: string, status: number): Guard<never> => ({
  ok: false,
  response: fail(message, status),
});

const roleMessage = (roles: readonly UserRole[]): string => {
  if (roles.length === 1 && roles[0] === 'patient') {
    return 'Rota exclusiva do portal do paciente';
  }
  if (roles.length === 1 && roles[0] === 'partner') {
    return 'Rota exclusiva do portal do parceiro';
  }
  return STAFF_ONLY_MESSAGE;
};

/**
 * Rotas da equipe — qualquer um dos 4 papéis de equipe, restrito pela família
 * de rota (RBAC-05/RBAC-06): Atendente e Profissional não acessam família
 * `administrative`, e Atendente não acessa família `clinical` (R3, RBAC-15/16).
 * A checagem fina de vínculo do Profissional com um paciente específico (R4)
 * não vive aqui — acontece no próprio handler, que conhece o `:id` da rota.
 *
 * LIMITAÇÃO CONHECIDA — revogação de conta desativada roda só na camada 1
 * (`src/proxy.ts`, via `isSessionRevoked`). Esta guarda é síncrona e a
 * checagem exige I/O; torná-la assíncrona muda a assinatura consumida por ~75
 * handlers. Consequência: nos cenários em que a camada 1 é contornada (matcher
 * alterado, chamada fora do pipeline HTTP), uma sessão de conta desativada
 * ainda passaria aqui. No fluxo HTTP normal a camada 1 barra em ≤ 60s.
 */
export function requireStaffSession(request: NextRequest): Guard<Session> {
  const mode = resolveAuthMode();
  if (mode === 'unconfigured') {
    return denied(AUTH_NOT_CONFIGURED_MESSAGE, 503);
  }

  const session = getRequestSession(request);
  if (!session) {
    return denied(UNAUTHENTICATED_MESSAGE, 401);
  }
  if (!isStaffRole(session.role)) {
    return denied(STAFF_ONLY_MESSAGE, 403);
  }
  if (!isAllowedForRole(request.nextUrl.pathname, session.role)) {
    return denied(ROLE_FAMILY_DENIED_MESSAGE, 403);
  }
  return { ok: true, session };
}

/**
 * Rotas do portal (paciente/parceiro). Diferente da guarda de equipe, exige
 * sessão REAL: o handler identifica o titular dos dados
 * por `session.subject`, então sem sessão não há o que responder.
 */
export function requirePortalSession(
  request: NextRequest,
  roles: UserRole | readonly UserRole[],
): Guard<Session> {
  const allowed = typeof roles === 'string' ? ([roles] as const) : roles;

  if (resolveAuthMode() === 'unconfigured') {
    return denied(AUTH_NOT_CONFIGURED_MESSAGE, 503);
  }

  const session = getRequestSession(request);
  if (!session) {
    return denied(UNAUTHENTICATED_MESSAGE, 401);
  }
  if (!allowed.includes(session.role)) {
    return denied(roleMessage(allowed), 403);
  }
  return { ok: true, session };
}
