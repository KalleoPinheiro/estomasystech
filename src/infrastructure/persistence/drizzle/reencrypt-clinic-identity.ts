import { asc, eq, isNotNull } from 'drizzle-orm';
import type { BlindIndex } from '@/lib/blind-index';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { providerCpfHash } from './drizzle-clinic-repository';
import { clinics } from './schema';

type ClinicChanges = Partial<typeof clinics.$inferInsert>;

/**
 * O que regravar no CPF da autônoma (#977): cifra fora da chave atual e índice
 * cego ausente ou de pepper anterior. Vazio quando nada muda.
 */
export function clinicCpfChanges(
  cipher: FieldCipher,
  blindIndex: BlindIndex,
  row: { cpf: string | null; cpfHash: string | null },
): ClinicChanges {
  if (row.cpf === null || row.cpf === '') return {};
  const changes: ClinicChanges = {};
  const cpf = cipher.decrypt(row.cpf);
  if (!cipher.isCurrent(row.cpf)) changes.cpf = cipher.encrypt(cpf);
  const cpfHash = providerCpfHash(blindIndex, cpf);
  if (row.cpfHash !== cpfHash) changes.cpfHash = cpfHash;
  return changes;
}

/**
 * Recifra do CPF da cliente autônoma (#977, ADR-096; `npm run data:reencrypt`).
 * Poucas linhas (uma por cliente): uma transação trava todas as que têm CPF e
 * regrava as que mudam, sem sobrescrever uma edição concorrente com valor
 * velho. Idempotente. Devolve quantas mudaram.
 */
export async function reencryptClinicIdentity(
  db: AppDb,
  cipher: FieldCipher,
  blindIndex: BlindIndex,
): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: clinics.id, cpf: clinics.cpf, cpfHash: clinics.cpfHash })
      .from(clinics)
      .where(isNotNull(clinics.cpf))
      .orderBy(asc(clinics.id))
      .for('update');
    let updated = 0;
    for (const row of rows) {
      const changes = clinicCpfChanges(cipher, blindIndex, row);
      if (Object.keys(changes).length === 0) continue;
      await tx.update(clinics).set(changes).where(eq(clinics.id, row.id));
      updated += 1;
    }
    return updated;
  });
}
