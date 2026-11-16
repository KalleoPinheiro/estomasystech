import { and, eq, isNull, or } from 'drizzle-orm';
import { dataCipherFromEnv, type FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { userAccounts } from './schema';

export interface OrphanPortalAccount {
  id: string;
  clinicId: string | null;
  email: string;
  role: 'patient' | 'partner';
  active: boolean;
}

/**
 * Contas de portal sem cadastro vinculado (#196). Sem vínculo o portal
 * responde 404 — é a lista que a equipe precisa revisar depois da migração
 * `0040` (que vincula pelo e-mail atual) e recriar em /configuracoes.
 * Leitura cross-empresa de propósito: relatório operacional, fora de request.
 */
export async function listOrphanPortalAccounts(
  db: AppDb,
  cipher: FieldCipher = dataCipherFromEnv(),
): Promise<OrphanPortalAccount[]> {
  const rows = await db
    .select({
      id: userAccounts.id,
      clinicId: userAccounts.clinicId,
      email: userAccounts.email,
      role: userAccounts.role,
      active: userAccounts.active,
    })
    .from(userAccounts)
    .where(
      or(
        and(eq(userAccounts.role, 'patient'), isNull(userAccounts.patientId)),
        and(eq(userAccounts.role, 'partner'), isNull(userAccounts.partnerId)),
      ),
    )
    .orderBy(userAccounts.clinicId, userAccounts.id);
  // O e-mail é cifrado (ADR-111): a ordem por e-mail dentro da empresa é em memória.
  const key = (account: OrphanPortalAccount) =>
    `${account.clinicId}\u0000${account.email}`;
  return rows
    .map((row) => ({
      ...row,
      email: cipher.decrypt(row.email),
      role: row.role as OrphanPortalAccount['role'],
    }))
    .sort((a, b) => key(a).localeCompare(key(b)));
}
