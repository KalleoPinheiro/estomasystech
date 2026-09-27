import { getDb } from "@/infrastructure/persistence/drizzle/db";
import { runRecoverSuperAdminCli } from "@/infrastructure/persistence/drizzle/recover-super-admin";

/**
 * Recuperação de emergência do super_admin (bloco B3, ADR-009): remove o
 * segundo fator e os códigos de recuperação, invalida a senha, troca o e-mail
 * se pedido, derruba as sessões, audita e imprime o link de definir senha.
 *
 * Uso (no servidor ou num checkout apontando para o banco de produção):
 *   DATABASE_URL=... APP_URL=https://... npm run admin:recover -- [--novo-email=<e-mail>] [--confirmar]
 *
 * Sem --confirmar só simula. Saída: 0 ok, 2 uso/pré-condição, 1 falha (nada gravado).
 * Roteiro completo: docs/engineering/producao.md § 10.
 */
process.env.VITTA_MIGRATE_ON_BOOT ??= "false";

runRecoverSuperAdminCli(process.argv.slice(2), {
  env: process.env,
  openDb: getDb,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
}).then((code) => process.exit(code));
