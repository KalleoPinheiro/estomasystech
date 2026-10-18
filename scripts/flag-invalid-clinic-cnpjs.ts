import { FlagInvalidClinicCnpjs } from "@/application/platform/flag-invalid-clinic-cnpjs";
import { getRepositories } from "@/infrastructure/container";
import { clinicScope, systemScope } from "@/lib/auth/tenant-scope";

/**
 * Saneamento dos CNPJs antigos com dígito verificador inválido (#355, ACE-RN-57).
 * Nunca apaga nem altera o número: marca a empresa para correção, que aparece
 * em Configurações e na ficha da plataforma, e audita sem o CNPJ. Idempotente.
 *
 * Uso (execução manual; nunca roda sozinha no deploy):
 *   DATABASE_URL=... npm run clinics:cnpj-review -- [--confirmar]
 *
 * Sem --confirmar só lista. Saída: 0 ok, 1 se alguma empresa falhou.
 */
process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT ??= "false";

async function main(): Promise<number> {
  const apply = process.argv.includes("--confirmar");
  const { clinics } = await getRepositories(systemScope());
  const auditByClinic = new Map<string, Awaited<ReturnType<typeof getRepositories>>["auditEvents"]>();
  for (const clinic of await clinics.findAll()) {
    auditByClinic.set(clinic.id, (await getRepositories(clinicScope(clinic.id))).auditEvents);
  }
  const found = await new FlagInvalidClinicCnpjs(clinics, (id) => auditByClinic.get(id) as never).execute({ apply });
  if (found.length === 0) {
    console.log("Nenhuma empresa com CNPJ inválido.");
    return 0;
  }
  console.log(`${found.length} empresa(s) com CNPJ inválido${apply ? "" : " (nada gravado; use --confirmar para marcar)"}:`);
  for (const item of found) {
    console.log([item.clinicId, item.name, item.cnpj, apply ? (item.flaggedNow ? "marcada agora" : "já marcada") : "pendente"].join("\t"));
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
