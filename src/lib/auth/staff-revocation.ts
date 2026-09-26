import { logError } from '@/lib/log-error';
import type { Session } from './session';
import { isStaffRole } from './staff-roles';

/**
 * Deny-list de sessões staff: a sessão HMAC é stateless (vale 12h), então
 * desativar uma conta em `user_accounts` não invalidava sessões já emitidas.
 * Semântica de deny-list (AD-001): só bloqueia quando a conta EXISTE e está
 * inativa — subject sem linha correspondente (sessões forjadas pela suíte E2E,
 * cookies de instalações antigas) segue válido. Falha de infraestrutura é
 * fail-open com log (AD-004).
 */
export const REVOCATION_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  revoked: boolean;
  expiresAtMs: number;
}

const cache = new Map<string, CacheEntry>();

export type AccountStatusLookup = (
  email: string,
  clinicId: string | null,
) => Promise<{ isActive: boolean } | null>;

async function lookupAccountStatus(
  email: string,
  clinicId: string | null,
): Promise<{ isActive: boolean } | null> {
  const [{ getDb }, { DrizzleUserAccountRepository }] = await Promise.all([
    import('@/infrastructure/persistence/drizzle/db'),
    import(
      '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories'
    ),
  ]);
  const account = await new DrizzleUserAccountRepository(
    await getDb(),
    clinicId,
  ).findByEmail(email);
  return account ? { isActive: account.isActive } : null;
}

export async function isStaffSessionRevoked(
  session: Session,
  lookup: AccountStatusLookup = lookupAccountStatus,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!isStaffRole(session.role) || !session.subject.includes('@')) {
    return false;
  }

  const cached = cache.get(session.subject);
  if (cached && nowMs < cached.expiresAtMs) {
    return cached.revoked;
  }

  try {
    const account = await lookup(session.subject, session.clinicId);
    const revoked = account !== null && !account.isActive;
    cache.set(session.subject, {
      revoked,
      expiresAtMs: nowMs + REVOCATION_CACHE_TTL_MS,
    });
    return revoked;
  } catch (error) {
    logError(
      'Revogação de sessão: falha ao consultar conta — fail-open (AD-004)',
      error,
    );
    return false;
  }
}

/** Limpa o cache — uso em testes e após alterar contas em /configuracoes. */
export function clearStaffRevocationCache(): void {
  cache.clear();
}
