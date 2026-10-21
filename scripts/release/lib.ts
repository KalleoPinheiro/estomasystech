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

/** Pastas cujo `.md` não é documentação: código, teste, pipeline ou configuração de agente. */
const NOT_DOCS = /^(src|tests|e2e|drizzle|scripts|deploy|\.github|\.claude|\.gate|\.husky|node_modules)\//;

/**
 * PR só de documentação (ADR-053): todo arquivo tocado (inclusive removido ou renomeado) é `.md`
 * fora de código, teste, pipeline e configuração de agente. Lista vazia não é docs-only: sem diff
 * legível, o recibo continua sendo exigido.
 */
export function isDocsOnly(touchedFiles: readonly string[]): boolean {
  return touchedFiles.length > 0 && touchedFiles.every((f) => f.endsWith('.md') && !NOT_DOCS.test(f));
}

export const ROLLBACKS = ['redeploy', 'backup'] as const;
export type Rollback = (typeof ROLLBACKS)[number];

export const isSemver = (value: string): boolean => SEMVER.test(value);
export const tagFor = (version: string): string => `v${version}`;

const RELEASE_BRANCH = /^release\/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const HOTFIX_BRANCH = /^hotfix\/[\w./-]+$/;

export const releaseBranchFor = (version: string): string => `release/${tagFor(version)}`;

/** Versão que o nome `release/vX.Y.Z` promete; `null` se o nome não segue o padrão. */
export const versionFromReleaseBranch = (branch: string): string | null =>
  RELEASE_BRANCH.exec(branch)?.[1] ?? null;

export const isHotfixBranch = (branch: string): boolean => HOTFIX_BRANCH.test(branch);

const core = (version: string): number[] => version.split('-')[0].split('.').map(Number);

/** `to` é a próxima versão patch de `from` (`0.3.0` → `0.3.1`): o que um hotfix pode gerar. */
export function isPatchBump(from: string, to: string): boolean {
  const [fa, fb, fc] = core(from);
  const [ta, tb, tc] = core(to);
  return fa === ta && fb === tb && tc === fc + 1;
}

export type VersionCheck = { ok: true } | { ok: false; reason: string };

/**
 * Confere a versão que o `changeset version` calculou contra a branch (ADR-052): em
 * `release/vX.Y.Z` o nome manda; em `hotfix/*` só vale um patch sobre a versão atual.
 */
export function checkVersionForBranch(branch: string, current: string, computed: string): VersionCheck {
  const promised = versionFromReleaseBranch(branch);
  if (promised !== null) {
    return promised === computed
      ? { ok: true }
      : {
          ok: false,
          reason: `a branch promete ${tagFor(promised)}, mas os changesets calculam ${tagFor(computed)}: ajuste os níveis dos changesets ou renomeie a release.`,
        };
  }
  if (isHotfixBranch(branch)) {
    return isPatchBump(current, computed)
      ? { ok: true }
      : { ok: false, reason: `hotfix só gera patch sobre ${current}; os changesets calculam ${computed}.` };
  }
  return { ok: false, reason: `rode em \`release/vX.Y.Z\` ou \`hotfix/*\` (branch atual: ${branch}).` };
}

/**
 * Releases abertas = branches `origin/release/vX.Y.Z` ainda não mergeadas na `main`.
 * Só uma pode existir por vez (ADR-052).
 */
export function pickOpenRelease(
  unmerged: readonly string[],
): { ok: true; branch: string | null } | { ok: false; reason: string } {
  const open = unmerged.map((b) => b.replace(/^origin\//, '')).filter((b) => versionFromReleaseBranch(b) !== null);
  if (open.length > 1) {
    return { ok: false, reason: `há mais de uma release aberta (${open.join(', ')}); só uma por vez.` };
  }
  return { ok: true, branch: open[0] ?? null };
}

/**
 * Seção "Homologação" do corpo do PR `feat/* → release/*` (ADR-052): linha `Seed:` e
 * cenários Dado/Quando/Então, ou `n/a — <motivo>` em cada uma. Só vale para PR que muda produção.
 */
export function checkHomologacao(body: string, changedFiles: readonly string[]): VersionCheck {
  if (!requiresChangeset(changedFiles)) return { ok: true };
  const text = body.replace(/<!--[\s\S]*?-->/g, '');
  const start = text.search(/^##\s+Homologa[cç][aã]o/im);
  if (start === -1) return { ok: false, reason: 'o PR não tem a seção `## Homologação` (template do PR).' };
  const rest = text.slice(start).split('\n').slice(1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const section = rest.slice(0, end === -1 ? undefined : end).join('\n');
  const seed = /^\s*Seed:\s*(\S.*)$/im.exec(section)?.[1] ?? '';
  if (seed.trim().length < 5) {
    return { ok: false, reason: 'preencha `Seed:` com o cenário acrescentado em scripts/seed/seed.ts ou `n/a — <motivo>`.' };
  }
  const scenarios = /\bDado\b/.test(section) && /\bQuando\b/.test(section) && /\bEntão\b/.test(section);
  const dispensed = /^\s*Cen[aá]rios:\s*n\/a\s*[—-]\s*\S.{9,}$/im.test(section);
  return scenarios || dispensed
    ? { ok: true }
    : { ok: false, reason: 'faltam cenários de homologação em Dado/Quando/Então (ou `Cenários: n/a — <motivo>`).' };
}

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

const lines = (out: string): string[] => out.split('\n').filter(Boolean);

/** Números das migrações novas desde a última tag (todas, se ainda não há tag). */
export function migrationsSinceLastTag(): string[] {
  const previous = sh('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*']);
  if (!previous.ok) return migrationsIn(lines(must('git', ['ls-files', 'drizzle'])));
  const diff = must('git', ['diff', '--name-only', `${previous.out}..HEAD`, '--', 'drizzle']);
  return migrationsIn(lines(diff));
}
