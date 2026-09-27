import { logError } from '@/lib/log-error';
import type { Session } from './session';

/**
 * Revogação de sessão (AD-001 → ADR-005). A sessão HMAC é stateless (vale
 * 12h); o proxy consulta a conta a cada 60 s e revoga quando ela EXISTE e
 * está inativa ou com `session_version` diferente do `sv` do token (logout,
 * troca/reset de senha e desativação incrementam a versão — #194). Vale para
 * todos os papéis, inclusive `patient`/`partner`. Subject sem linha
 * correspondente (sessões forjadas pela suíte E2E, cookies de instalações
 * antigas) segue válido — semântica de deny-list. Falha de infraestrutura é
 * fail-open com log (AD-004).
 */
export const REVOCATION_CACHE_TTL_MS = 60_000;

export interface AccountSessionStatus {
  isActive: boolean;
  sessionVersion: number;
}

interface CacheEntry {
  status: AccountSessionStatus | null;
  expiresAtMs: number;
}

const cache = new Map<string, CacheEntry>();

/** O mesmo e-mail pode existir em duas empresas (MT-06): a chave inclui a empresa. */
const cacheKey = (subject: string, clinicId: string | null): string =>
  `${clinicId ?? 'system'}|${subject.trim().toLowerCase()}`;

export type AccountStatusLookup = (
  email: string,
  clinicId: string | null,
) => Promise<AccountSessionStatus | null>;

async function lookupAccountStatus(
  email: string,
  clinicId: string | null,
): Promise<AccountSessionStatus | null> {
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
  return account
    ? { isActive: account.isActive, sessionVersion: account.sessionVersion }
    : null;
}

async function accountStatus(
  session: Session,
  lookup: AccountStatusLookup,
  nowMs: number,
): Promise<AccountSessionStatus | null> {
  const key = cacheKey(session.subject, session.clinicId);
  const cached = cache.get(key);
  if (cached && nowMs < cached.expiresAtMs) {
    return cached.status;
  }
  const status = await lookup(session.subject, session.clinicId);
  cache.set(key, { status, expiresAtMs: nowMs + REVOCATION_CACHE_TTL_MS });
  return status;
}

export async function isSessionRevoked(
  session: Session,
  lookup: AccountStatusLookup = lookupAccountStatus,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!session.subject.includes('@')) {
    return false;
  }
  try {
    const status = await accountStatus(session, lookup, nowMs);
    if (status === null) {
      return false;
    }
    return (
      !status.isActive ||
      status.sessionVersion !== (session.sessionVersion ?? 0)
    );
  } catch (error) {
    logError(
      'Revogação de sessão: falha ao consultar conta — fail-open (AD-004)',
      error,
    );
    return false;
  }
}

/**
 * Esquece o status em cache de uma conta — chamado logo depois de incrementar
 * a versão, para que ESTE processo revogue na hora. Outras instâncias revogam
 * quando o cache delas expira (≤ 60 s).
 */
export function forgetSessionStatus(
  subject: string,
  clinicId: string | null,
): void {
  cache.delete(cacheKey(subject, clinicId));
}

/** Limpa o cache — uso em testes. */
export function clearSessionRevocationCache(): void {
  cache.clear();
}
