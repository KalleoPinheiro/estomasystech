import type { AccountManager } from '@/domain/auth/account-management';
import type { Session } from '@/lib/auth/session';

/**
 * Ator das rotas de gestão de conta. "Modo aberto" (sem sessão, só dev) age como
 * super_admin, igual ao `POST /api/accounts`.
 */
export function accountManager(session: Session | null): AccountManager {
  return session
    ? { role: session.role, subject: session.subject }
    : { role: 'super_admin', subject: null };
}
