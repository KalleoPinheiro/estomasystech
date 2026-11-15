import { asc, eq, gt } from 'drizzle-orm';
import type { BlindIndex } from '@/lib/blind-index';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { hashOrNull } from './drizzle-patient-repository';
import { patients } from './schema';

const BATCH_SIZE = 200;

type PatientRow = typeof patients.$inferSelect;
type PatientChanges = Partial<typeof patients.$inferInsert>;

/** Valor que precisa ser regravado: em claro, formato legado ou chave anterior. */
function sealed(cipher: FieldCipher, value: string | null): string | null {
  if (value === null || value === '' || cipher.isCurrent(value)) return null;
  return cipher.encrypt(cipher.decrypt(value));
}

function textChanges(cipher: FieldCipher, row: PatientRow): PatientChanges {
  const changes: PatientChanges = {};
  const fullName = sealed(cipher, row.fullName);
  if (fullName !== null) changes.fullName = fullName;
  const email = sealed(cipher, row.email);
  if (email !== null) changes.email = email;
  const phone = sealed(cipher, row.phone);
  if (phone !== null) changes.phone = phone;
  return changes;
}

/** Nascimento: da coluna em claro (legado) para a cifrada, que também acompanha a chave atual. */
function birthChanges(cipher: FieldCipher, row: PatientRow): PatientChanges {
  if (row.birthDate !== null && !row.birthDateEnc) {
    return {
      birthDateEnc: cipher.encrypt(row.birthDate.toISOString()),
      birthDate: null,
    };
  }
  const changes: PatientChanges = {};
  if (row.birthDate !== null) changes.birthDate = null;
  const birth = sealed(cipher, row.birthDateEnc);
  if (birth !== null) changes.birthDateEnc = birth;
  return changes;
}

/** Índice cego: preenche o que falta e recalcula o que não está no pepper atual. */
function hashChanges(
  cipher: FieldCipher,
  blindIndex: BlindIndex,
  row: PatientRow,
): PatientChanges {
  const wanted = {
    cpfHash: hashOrNull(
      blindIndex,
      row.clinicId,
      'cpf',
      cipher.decryptNullable(row.cpf),
    ),
    phoneHash: hashOrNull(
      blindIndex,
      row.clinicId,
      'phone',
      cipher.decrypt(row.phone),
    ),
    emailHash: hashOrNull(
      blindIndex,
      row.clinicId,
      'email',
      cipher.decryptNullable(row.email),
    ),
  };
  const changes: PatientChanges = {};
  for (const key of ['cpfHash', 'phoneHash', 'emailHash'] as const) {
    if (row[key] !== wanted[key]) changes[key] = wanted[key];
  }
  return changes;
}

function identityChanges(
  cipher: FieldCipher,
  blindIndex: BlindIndex,
  row: PatientRow,
): PatientChanges {
  return {
    ...textChanges(cipher, row),
    ...birthChanges(cipher, row),
    ...hashChanges(cipher, blindIndex, row),
  };
}

/**
 * Relê a linha com trava e calcula as mudanças dela: uma edição ou anonimização
 * que ocorreu depois da leitura do lote não é sobrescrita com valor velho.
 */
export async function rewriteLocked(
  db: AppDb,
  cipher: FieldCipher,
  blindIndex: BlindIndex,
  id: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(patients)
      .where(eq(patients.id, id))
      .for('update');
    if (!row) return false;
    const changes = identityChanges(cipher, blindIndex, row);
    if (Object.keys(changes).length === 0) return false;
    await tx.update(patients).set(changes).where(eq(patients.id, id));
    return true;
  });
}

/**
 * Backfill da cifra do cadastro (ADR-096, #735; `npm run data:reencrypt`):
 * cifra nome, e-mail e telefone em claro, move o nascimento para a coluna
 * cifrada (zerando a legada), preenche e recalcula o índice cego. Idempotente:
 * uma segunda rodada não muda nada. Devolve quantos pacientes mudaram.
 */
export async function reencryptPatientIdentity(
  db: AppDb,
  cipher: FieldCipher,
  blindIndex: BlindIndex,
): Promise<number> {
  let updated = 0;
  let after = '';
  for (;;) {
    // Paginação por chave (não OFFSET): a linha regravada não muda de posição.
    const rows = await db
      .select()
      .from(patients)
      .where(gt(patients.id, after))
      .orderBy(asc(patients.id))
      .limit(BATCH_SIZE);
    if (rows.length === 0) return updated;
    for (const row of rows) {
      if (await rewriteLocked(db, cipher, blindIndex, row.id)) updated += 1;
    }
    after = rows[rows.length - 1].id;
  }
}
