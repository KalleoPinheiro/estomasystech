import { z } from "zod";
import { getRepositories } from "@/infrastructure/container";
import { systemScope } from "@/lib/auth/tenant-scope";
import {
  importTaxonomyCatalog,
  type TaxonomyCatalog,
} from "@/application/taxonomy/import-taxonomy-catalog";
import {
  STOMATHERAPY_DIAGNOSES,
  STOMATHERAPY_INTERVENTIONS,
  STOMATHERAPY_LINKAGES,
  STOMATHERAPY_OUTCOMES,
} from "@/infrastructure/persistence/taxonomy-seed/stomatherapy-seed";

const catalogShapeSchema = z.object({
  diagnoses: z.array(z.record(z.string(), z.unknown())),
  outcomes: z.array(z.record(z.string(), z.unknown())),
  interventions: z.array(z.record(z.string(), z.unknown())),
  linkages: z.array(z.record(z.string(), z.unknown())),
});

async function loadCatalog(filePath: string | undefined): Promise<TaxonomyCatalog> {
  if (!filePath) {
    return {
      diagnoses: STOMATHERAPY_DIAGNOSES,
      outcomes: STOMATHERAPY_OUTCOMES,
      interventions: STOMATHERAPY_INTERVENTIONS,
      linkages: STOMATHERAPY_LINKAGES,
    };
  }
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(filePath, "utf-8");
  return catalogShapeSchema.parse(JSON.parse(raw)) as unknown as TaxonomyCatalog;
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  const catalog = await loadCatalog(filePath);
  const repos = await getRepositories(systemScope());
  const result = await importTaxonomyCatalog(
    {
      diagnoses: repos.nursingDiagnoses,
      outcomes: repos.nursingOutcomes,
      interventions: repos.nursingInterventions,
      linkages: repos.taxonomyLinkages,
    },
    catalog,
  );
  console.log(filePath ? `Fonte: ${filePath}` : "Fonte: subset curado de estomaterapia (dev/CI)");
  console.log(
    `Taxonomia importada — diagnósticos: ${result.diagnoses}, resultados: ${result.outcomes}, ` +
      `intervenções: ${result.interventions}, ligações: ${result.linkages}.`,
  );
}

main().catch((error: unknown) => {
  console.error("Falha ao importar taxonomia:", error);
  process.exitCode = 1;
});
