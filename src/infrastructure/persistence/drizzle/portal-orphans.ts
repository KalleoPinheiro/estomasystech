import { and, eq, isNull, or } from 'drizzle-orm';
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
    .orderBy(userAccounts.clinicId, userAccounts.email);
  return rows.map((row) => ({
    ...row,
    role: row.role as OrphanPortalAccount['role'],
  }));
}
