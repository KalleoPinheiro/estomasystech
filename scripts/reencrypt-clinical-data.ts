import { getSystemDb } from "@/infrastructure/persistence/drizzle/db";
import { reencryptAccountIdentity } from "@/infrastructure/persistence/drizzle/reencrypt-account-identity";
import { reencryptGuardianIdentity } from "@/infrastructure/persistence/drizzle/reencrypt-guardian-identity";
import { reencryptPatientIdentity } from "@/infrastructure/persistence/drizzle/reencrypt-patient-identity";
import { blindIndexFromEnv } from "@/lib/blind-index";
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
  if (!process.env.BLIND_INDEX_PEPPER?.trim()) {
    throw new Error("Defina BLIND_INDEX_PEPPER para preencher o índice cego do cadastro");
  }
  if (!process.env.DATA_ENCRYPTION_KEY) {
    throw new Error("Defina DATA_ENCRYPTION_KEY (a chave atual) para recifrar");
  }
  // Falha antes de qualquer escrita se o pepper for inválido.
  const blindIndex = blindIndexFromEnv();
  // Conexão de sistema (BYPASSRLS): a recifra percorre todas as clínicas e o FORCE sujeita o dono à política (#874).
  const db = await getSystemDb();
  const cipher = dataCipherFromEnv();
  const counts = await reencryptClinicalData(db, cipher);
  // Cadastro do paciente (ADR-096): cifra nome, e-mail, telefone e nascimento e preenche o índice cego.
  counts.patients_identity = await reencryptPatientIdentity(db, cipher, blindIndex);
  // Responsável (ADR-096, #739): nome, telefone e e-mail cifrados e índice cego.
  counts.guardians_identity = await reencryptGuardianIdentity(db, cipher, blindIndex);
  // E-mail de login da conta (ADR-111, #742): cifra e preenche o índice cego usado no login.
  counts.user_accounts_email = await reencryptAccountIdentity(db, cipher, blindIndex);
  let total = 0;
  for (const [table, updated] of Object.entries(counts)) {
    total += updated;
    console.log(`${table}\t${updated} linha(s) regravada(s)`);
  }
  if (total === 0 && !process.env.DATABASE_SYSTEM_URL) {
    // Com FORCE (#874) o dono sem BYPASSRLS enxerga zero linhas: "nada pendente" aqui não prova nada.
    console.log("Nenhuma linha visível sem DATABASE_SYSTEM_URL: com FORCE o resultado pode estar incompleto. Defina DATABASE_SYSTEM_URL e rode de novo antes de aposentar a chave anterior.");
  } else {
    console.log(total === 0 ? "Nada pendente: tudo na chave atual." : `Total: ${total}. Rode de novo para confirmar 0 pendências.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
