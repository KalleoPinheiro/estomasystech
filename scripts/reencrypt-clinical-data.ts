import { getDb } from "@/infrastructure/persistence/drizzle/db";
import { reencryptClinicalData } from "@/infrastructure/persistence/drizzle/reencrypt-clinical-data";
import { dataCipherFromEnv } from "@/lib/data-cipher";

/**
 * Recifra do dado clínico (#195, ADR-006): regrava com `DATA_ENCRYPTION_KEY`
 * todo texto clínico em claro, no formato legado (`AUTH_SECRET`) ou cifrado
 * com uma chave de `DATA_ENCRYPTION_KEY_PREVIOUS`. Idempotente.
 *
 * Uso (de um checkout, apontando para o banco de produção):
 *   DATABASE_URL=... DATA_ENCRYPTION_KEY=... [DATA_ENCRYPTION_KEY_PREVIOUS=...] \
 *   [AUTH_SECRET=<o antigo, se ainda houver dado legado>] npm run data:reencrypt
 *
 * Roteiro completo: docs/engineering/producao.md § 6.
 */
async function main(): Promise<void> {
  process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT ??= "false";
  // Fora de produção cairia na chave de desenvolvimento: aqui ela é exigida.
  if (!process.env.DATA_ENCRYPTION_KEY) {
    throw new Error("Defina DATA_ENCRYPTION_KEY (a chave atual) para recifrar");
  }
  const counts = await reencryptClinicalData(await getDb(), dataCipherFromEnv());
  let total = 0;
  for (const [table, updated] of Object.entries(counts)) {
    total += updated;
    console.log(`${table}\t${updated} linha(s) regravada(s)`);
  }
  console.log(total === 0 ? "Nada pendente: tudo na chave atual." : `Total: ${total}. Rode de novo para confirmar 0 pendências.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
