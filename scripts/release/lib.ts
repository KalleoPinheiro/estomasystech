/**
 * Regras puras do release (ADR-043): quando um PR exige changeset, o que entra na GitHub
 * Release e qual tag cria. A parte com git e rede fica em `prepare.ts` e `publish.ts`.
 */
import { spawnSync } from 'node:child_process';

/** Caminhos cujo PR muda o que roda em produção e, por isso, exige changeset. */
const CHANGESET_PATHS = [/^src\//, /^drizzle\//, /^Dockerfile$/];
const CHANGESET_FILE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;
const MIGRATION_FILE = /^drizzle\/(\d{4})_[^/]+\.sql$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const ROLLBACKS = ['redeploy', 'backup'] as const;
export type Rollback = (typeof ROLLBACKS)[number];

export const isSemver = (value: string): boolean => SEMVER.test(value);
export const tagFor = (version: string): string => `v${version}`;

export const requiresChangeset = (changedFiles: readonly string[]): boolean =>
  changedFiles.some((file) => CHANGESET_PATHS.some((re) => re.test(file)));

export const hasChangesetFile = (addedFiles: readonly string[]): boolean =>
  addedFiles.some((file) => CHANGESET_FILE.test(file));

/** Arquivos `.changeset/*.md` pendentes, sem o README. */
export const pendingChangesets = (files: readonly string[]): string[] =>
  files.filter((file) => CHANGESET_FILE.test(file));

/** Números das migrações (`0067`) presentes na lista de arquivos, em ordem. */
export const migrationsIn = (files: readonly string[]): string[] =>
  files
    .map((file) => MIGRATION_FILE.exec(file)?.[1])
    .filter((n): n is string => n !== undefined)
    .sort();

/** Seção `## <versão>` do CHANGELOG gerado pelo Changesets, sem o título. */
export function changelogSection(changelog: string, version: string): string | null {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return null;
  const next = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  const body = lines.slice(start + 1, next === -1 ? undefined : next).join('\n').trim();
  return body === '' ? null : body;
}

export function parseRollback(value: string | undefined): Rollback | null {
  return ROLLBACKS.find((r) => r === value) ?? null;
}

/** Corpo da GitHub Release: changelog, migrações do lote e o rollback que vale para ele. */
export function releaseBody(input: {
  version: string;
  section: string;
  migrations: readonly string[];
  rollback: Rollback;
}): string {
  const migrations =
    input.migrations.length === 0
      ? 'Nenhuma migração neste lote.'
      : `Migrações neste lote: ${input.migrations.join(', ')}.`;
  const rollback =
    input.rollback === 'redeploy'
      ? 'Rollback: redeploy da tag anterior (o lote não muda o esquema, ou só o amplia).'
      : 'Rollback: restaurar o backup tirado antes do deploy (o lote muda o esquema de forma que o código antigo não ignora).';
  return `${input.section}\n\n---\n\n${migrations}\n${rollback}\n`;
}

export interface ShResult {
  ok: boolean;
  out: string;
}

/** Executa um comando sem shell; `out` junta stdout e stderr aparados. */
export function sh(cmd: string, args: readonly string[]): ShResult {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

export function must(cmd: string, args: readonly string[]): string {
  const r = sh(cmd, args);
  if (!r.ok) {
    console.error(`✗ ${cmd} ${args.join(' ')}\n${r.out}`);
    process.exit(1);
  }
  return r.out;
}
