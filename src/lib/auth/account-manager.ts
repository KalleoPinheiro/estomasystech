import type { AccountManager } from '@/domain/auth/account-management';
import type { Session } from '@/lib/auth/session';

/**
 * Ator das rotas de gestão de conta: sempre a conta da sessão. O super_admin
 * não gerencia conta dentro da clínica, só cadastra `company_admin` pela
 * plataforma (ADR-007, #253).
 */
export function accountManager(session: Session): AccountManager {
  return { role: session.role, subject: session.subject };
}
