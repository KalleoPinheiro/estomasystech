import { type NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { recordAuditNow } from '@/lib/audit';
import { getRequestSession } from '@/lib/auth/request-session';
import { SESSION_COOKIE, type Session } from '@/lib/auth/session';
import { forgetSessionStatus } from '@/lib/auth/staff-revocation';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { logError } from '@/lib/log-error';

export async function POST(request: NextRequest) {
  // Lê a sessão ANTES de limpar o cookie — sem sessão só não audita, não vira
  // erro (o logout ainda precisa limpar o cookie normalmente).
  const session = getRequestSession(request);
  if (session) {
    await revokeAccountSessions(session);
    try {
      const { auditEvents } = await getRepositories(sessionScope(session));
      // AC-03 não define a `action` — "delete" reflete o encerramento da sessão
      // (spec-precision gap: valor exato não especificado no spec.md).
      await recordAuditNow(auditEvents, session, {
        action: 'delete',
        resourceType: 'session',
        resourceId: session.subject,
      });
    } catch (error) {
      // Falha de auditoria nunca pode impedir o logout — indisponibilidade
      // transitória do banco não pode travar quem está tentando sair.
      logError('Auditoria: falha ao registrar logout', error);
    }
  }

  const response = NextResponse.json({
    success: true,
    data: { ok: true },
    error: null,
  });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}

/**
 * Logout encerra TODAS as sessões da conta (#194, ADR-005): um cookie copiado
 * ou roubado deixa de valer no próximo check do proxy. Falha aqui é logada e
 * não impede o logout — o cookie local é limpo de qualquer forma.
 */
async function revokeAccountSessions(session: Session): Promise<void> {
  try {
    const { userAccounts } = await getRepositories(sessionScope(session));
    const account = await userAccounts.findByEmail(session.subject);
    if (!account) {
      return;
    }
    await userAccounts.revokeSessions(account.id);
    forgetSessionStatus(session.subject, session.clinicId);
  } catch (error) {
    logError('Logout: falha ao revogar as sessões da conta', error);
  }
}
