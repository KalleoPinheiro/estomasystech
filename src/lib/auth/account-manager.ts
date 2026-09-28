import type { AccountManager } from '@/domain/auth/account-management';
import type { Session } from '@/lib/auth/session';

/**
 * Ator das rotas de gestão de conta. "Modo aberto" (sem sessão, só dev) age como
 * company_admin, igual ao `POST /api/accounts` (ADR-007: o super_admin não
 * gerencia conta dentro da clínica, só cadastra `company_admin` pela
 * plataforma — #253).
 */
export function accountManager(session: Session | null): AccountManager {
  return session
    ? { role: session.role, subject: session.subject }
    : { role: 'company_admin', subject: null };
}
