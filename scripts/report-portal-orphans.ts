import { getDb } from "@/infrastructure/persistence/drizzle/db";
import { listOrphanPortalAccounts } from "@/infrastructure/persistence/drizzle/portal-orphans";

/**
 * Relatório de contas de portal sem cadastro vinculado (#196), para rodar
 * depois da migração `0040`. Uso: `DATABASE_URL=... npm run db:portal-orphans`.
 * Imprime uma linha por conta (empresa, papel, e-mail, ativa) e sai com 0.
 * As contas listadas não abrem o portal até serem recriadas em /configuracoes
 * com o paciente/parceiro correto.
 */
async function main(): Promise<void> {
  process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT ??= "false";
  const orphans = await listOrphanPortalAccounts(await getDb());
  if (orphans.length === 0) {
    console.log("Nenhuma conta de portal sem vínculo.");
    return;
  }
  console.log(`${orphans.length} conta(s) de portal sem vínculo:`);
  for (const account of orphans) {
    console.log(
      [account.clinicId ?? "(sistema)", account.role, account.email, account.active ? "ativa" : "inativa"].join("\t"),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
