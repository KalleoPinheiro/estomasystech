import { asc, eq, gt } from 'drizzle-orm';
import type { BlindIndex } from '@/lib/blind-index';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { hashOrNull } from './drizzle-patient-repository';
import { guardians } from './schema';

const BATCH_SIZE = 200;

type GuardianRow = typeof guardians.$inferSelect;
type GuardianChanges = Partial<typeof guardians.$inferInsert>;

/** Valor que precisa ser regravado: em claro, formato legado ou chave anterior. */
function sealed(cipher: FieldCipher, value: string | null): string | null {
  if (value === null || value === '' || cipher.isCurrent(value)) return null;
  return cipher.encrypt(cipher.decrypt(value));
}

function identityChanges(
  cipher: FieldCipher,
  blindIndex: BlindIndex,
  row: GuardianRow,
): GuardianChanges {
  const changes: GuardianChanges = {};
  const fullName = sealed(cipher, row.fullName);
  if (fullName !== null) changes.fullName = fullName;
  const phone = sealed(cipher, row.phone);
  if (phone !== null) changes.phone = phone;
  const email = sealed(cipher, row.email);
  if (email !== null) changes.email = email;
  // Índice cego: preenche o que falta e recalcula o que não está no pepper atual.
  const phoneHash = hashOrNull(
    blindIndex,
    row.clinicId,
    'phone',
    cipher.decrypt(row.phone),
  );
  if (row.phoneHash !== phoneHash) changes.phoneHash = phoneHash;
  const emailHash = hashOrNull(
    blindIndex,
    row.clinicId,
    'email',
    cipher.decryptNullable(row.email),
  );
  if (row.emailHash !== emailHash) changes.emailHash = emailHash;
  return changes;
}

/**
 * Relê a linha com trava e calcula as mudanças dela: uma edição que ocorreu
 * depois da leitura do lote não é sobrescrita com valor velho.
 */
export async function rewriteGuardianLocked(
  db: AppDb,
  cipher: FieldCipher,
  blindIndex: BlindIndex,
  id: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(guardians)
      .where(eq(guardians.id, id))
      .for('update');
    if (!row) return false;
    const changes = identityChanges(cipher, blindIndex, row);
    if (Object.keys(changes).length === 0) return false;
    await tx.update(guardians).set(changes).where(eq(guardians.id, id));
    return true;
  });
}

/**
 * Backfill da cifra do responsável (ADR-096, #739; `npm run data:reencrypt`):
 * cifra nome, telefone e e-mail em claro e preenche ou recalcula o índice cego.
 * Idempotente: uma segunda rodada não muda nada. Devolve quantos mudaram.
 */
export async function reencryptGuardianIdentity(
  db: AppDb,
  cipher: FieldCipher,
  blindIndex: BlindIndex,
): Promise<number> {
  let updated = 0;
  let after = '';
  for (;;) {
    // Paginação por chave (não OFFSET): a linha regravada não muda de posição.
    const rows = await db
      .select({ id: guardians.id })
      .from(guardians)
      .where(gt(guardians.id, after))
      .orderBy(asc(guardians.id))
      .limit(BATCH_SIZE);
    if (rows.length === 0) return updated;
    for (const row of rows) {
      if (await rewriteGuardianLocked(db, cipher, blindIndex, row.id)) {
        updated += 1;
      }
    }
    after = rows[rows.length - 1].id;
  }
}
