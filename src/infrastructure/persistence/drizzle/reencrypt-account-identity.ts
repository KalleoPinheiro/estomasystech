import { asc, eq, gt } from 'drizzle-orm';
import type { BlindIndex } from '@/lib/blind-index';
import type { FieldCipher } from '@/lib/data-cipher';
import { logger } from '@/lib/observability/logger';
import type { AppDb } from './db';
import { loginEmailHash } from './drizzle-foundation-repositories';
import { userAccounts } from './schema';

const BATCH_SIZE = 200;

type AccountRow = typeof userAccounts.$inferSelect;
type AccountChanges = Partial<typeof userAccounts.$inferInsert>;

/**
 * Mudanças da linha: cifra o e-mail em claro (ou de chave anterior) e preenche
 * ou recalcula o índice cego. Conta anonimizada já não tem e-mail pessoal e
 * fica de fora. E-mail que não normaliza não tem como ser achado pelo hash:
 * a linha fica como está (nunca cifrada sem índice, que a deixaria sem login) e
 * o id vai para o log.
 */
function identityChanges(
  cipher: FieldCipher,
  blindIndex: BlindIndex,
  row: AccountRow,
): AccountChanges {
  if (row.anonymizedAt !== null) return {};
  const plain = cipher.decrypt(row.email);
  const emailHash = loginEmailHash(blindIndex, plain);
  if (emailHash === null) {
    logger.warn(
      `[accounts] e-mail da conta ${row.id} não normaliza; segue sem cifra nem índice cego até a clínica corrigir`,
    );
    return {};
  }
  const changes: AccountChanges = {};
  if (!cipher.isCurrent(row.email)) changes.email = cipher.encrypt(plain);
  if (row.emailHash !== emailHash) changes.emailHash = emailHash;
  return changes;
}

/**
 * Relê a linha com trava e calcula as mudanças dela: uma troca de e-mail que
 * ocorreu depois da leitura do lote não é sobrescrita com valor velho.
 */
export async function rewriteAccountLocked(
  db: AppDb,
  cipher: FieldCipher,
  blindIndex: BlindIndex,
  id: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(userAccounts)
      .where(eq(userAccounts.id, id))
      .for('update');
    if (!row) return false;
    const changes = identityChanges(cipher, blindIndex, row);
    if (Object.keys(changes).length === 0) return false;
    await tx.update(userAccounts).set(changes).where(eq(userAccounts.id, id));
    return true;
  });
}

/**
 * Backfill da cifra do e-mail de login (ADR-111, #742; `npm run data:reencrypt`):
 * cifra o e-mail em claro e preenche ou recalcula o índice cego. Idempotente:
 * uma segunda rodada não muda nada. Devolve quantas contas mudaram.
 */
export async function reencryptAccountIdentity(
  db: AppDb,
  cipher: FieldCipher,
  blindIndex: BlindIndex,
): Promise<number> {
  let updated = 0;
  let after = '';
  for (;;) {
    // Paginação por chave (não OFFSET): a linha regravada não muda de posição.
    const rows = await db
      .select({ id: userAccounts.id })
      .from(userAccounts)
      .where(gt(userAccounts.id, after))
      .orderBy(asc(userAccounts.id))
      .limit(BATCH_SIZE);
    if (rows.length === 0) return updated;
    for (const row of rows) {
      if (await rewriteAccountLocked(db, cipher, blindIndex, row.id)) {
        updated += 1;
      }
    }
    after = rows[rows.length - 1].id;
  }
}
