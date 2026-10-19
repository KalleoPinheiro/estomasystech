import { MIN_PASSWORD_LENGTH } from "@/domain/auth/password-policy";
import { getDb } from "@/infrastructure/persistence/drizzle/db";
import { assertNotProductionDatabase, resolveAppEnv } from "@/lib/runtime-env";
import { seedHomologation } from "./seed";

/**
 * Semeia a massa fictícia (ADR-041): `npm run seed:staging`.
 * Recusa `APP_ENV=production` e banco listado em `PRODUCTION_DB_HOSTS`.
 * Exige `STAGING_SEED_PASSWORD` (>= 10 caracteres) e `DATA_ENCRYPTION_KEY` de homologação.
 * Roda no build da Vercel (scripts/vercel-build.ts) e à mão.
 */
async function main(): Promise<void> {
  const appEnv = resolveAppEnv();
  if (appEnv === "production") {
    throw new Error("Seed de homologação recusado em APP_ENV=production.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não configurada.");
  }
  assertNotProductionDatabase(databaseUrl);
  const password = process.env.STAGING_SEED_PASSWORD ?? "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`STAGING_SEED_PASSWORD obrigatória (mínimo ${MIN_PASSWORD_LENGTH} caracteres).`);
  }
  // A migração é um passo anterior do build; aqui o app não migra de novo.
  process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT ??= "false";
  await getDb();
  const report = await seedHomologation({ password });
  console.log(report.skipped ? "Seed: já semeado, nada alterado." : `Seed: ${JSON.stringify(report.counts)}`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
