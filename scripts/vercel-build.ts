import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertNotProductionDatabase, resolveAppEnv } from "../src/lib/runtime-env";

/**
 * Build da Vercel (ADR-041, `vercel.json`). Em homologação/preview migra e
 * semeia o banco antes do `next build`; em production (ou fora da Vercel) só
 * builda e nunca toca banco. A migração roda aqui, não no boot, porque
 * serverless não tem um processo único para travar (ESTOMASYSTECH_MIGRATE_ON_BOOT=false).
 */
export type BuildStep = readonly string[];

export function planBuild(env: Readonly<Record<string, string | undefined>>): BuildStep[] {
  const appEnv = resolveAppEnv(env);
  // `npm run build` preserva o --max-old-space-size=4096 do script (AGENTS.md).
  const build: BuildStep = ["npm", "run", "build"];
  if (appEnv !== "staging" && appEnv !== "preview") {
    return [build];
  }
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL (ou DATABASE_URL_UNPOOLED) obrigatória em homologação.");
  }
  assertNotProductionDatabase(url, env);
  return [
    ["npx", "--no-install", "drizzle-kit", "migrate"],
    ["npx", "--no-install", "tsx", "scripts/seed/run.ts"],
    build,
  ];
}

function run(step: BuildStep, env: NodeJS.ProcessEnv): void {
  const [bin, ...args] = step;
  const databaseUrl = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  const result = spawnSync(bin, args, {
    stdio: "inherit",
    env: { ...env, ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}) },
  });
  if (result.status !== 0) {
    throw new Error(`Passo falhou: ${step.join(" ")}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    for (const step of planBuild(process.env)) {
      run(step, process.env);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
