/**
 * Regras puras do `npm run release:cut` (ADR-071). A parte com git, rede e processos fica em
 * `cut.ts`; aqui só decisões testáveis: a marca de homologação, o estado da release, o
 * TESTE-ALTERADO consolidado do lote e o corpo do PR `release → main`.
 */
import { basename, dirname, join } from 'node:path';
import { findReason } from '../gate/test-integrity';
import { tagFor, type VersionCheck } from './lib';

/**
 * Marca de homologação: a branch `homologacao/vX.Y.Z` aponta para o SHA da release que a
 * validação em contexto limpo aprovou na staging. Quem aprova (o coordenador) a cria ou move com
 * `git push --force origin <sha>:refs/heads/homologacao/vX.Y.Z` ou pelo GitHub; o `release:cut`
 * só lê. Branch, e não tag nem arquivo, porque não muda o SHA da release e dá para criar sem `gh`.
 */
export const approvalBranch = (version: string): string => `homologacao/${tagFor(version)}`;

export const releaseCommitSubject = (version: string): string => `chore(release): ${tagFor(version)}`;

export interface HeadState {
  /** SHA para onde a marca aponta; `null` se ela não existe. */
  approved: string | null;
  head: string;
  /** Pai do HEAD e assunto do HEAD: a release já preparada tem o commit de versão no topo. */
  parent: string;
  subject: string;
  version: string;
}

export type CutStart = { ok: true; prepared: boolean } | { ok: false; reason: string };

/**
 * A release só é cortada sobre o SHA homologado. Aceita também o HEAD que é exatamente o commit
 * de versão do `release:prepare` em cima do SHA homologado: é a nova execução depois de um gate
 * que falhou por ambiente, e o `prepare` não roda de novo.
 */
export function cutStart(s: HeadState): CutStart {
  const marker = approvalBranch(s.version);
  if (s.approved === null)
    return { ok: false, reason: `sem marca de homologação: a branch ${marker} não existe no origin.` };
  if (s.approved === s.head) return { ok: true, prepared: false };
  if (s.approved === s.parent && s.subject === releaseCommitSubject(s.version)) return { ok: true, prepared: true };
  return {
    ok: false,
    reason: `${marker} aponta para ${s.approved.slice(0, 7)}, mas a release está em ${s.head.slice(0, 7)}: homologue este SHA na staging antes de cortar.`,
  };
}

/** A versão do `package.json` depois do `prepare` precisa ser a que o nome da release promete. */
export function checkPreparedVersion(promised: string, packageVersion: string): VersionCheck {
  return promised === packageVersion
    ? { ok: true }
    : {
        ok: false,
        reason: `package.json está em ${packageVersion}, mas a release promete ${promised}: o release:prepare não versionou.`,
      };
}

const SQUASH = /\(#(\d+)\)\s*$/;
const MERGE = /^Merge pull request #(\d+)\b/;

/** Números dos PRs do lote, a partir dos assuntos de `git log origin/main..HEAD`. */
export function prNumbersFromSubjects(subjects: readonly string[]): number[] {
  const numbers = subjects
    .map((s) => SQUASH.exec(s)?.[1] ?? MERGE.exec(s)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return [...new Set(numbers)].sort((a, b) => a - b);
}

export interface PrBody {
  number: number;
  body: string;
}

/**
 * Linha `TESTE-ALTERADO:` única para o PR `release → main`, juntando o motivo declarado em cada
 * PR do lote (`#N motivo; #M motivo`). `null` quando nenhum PR declarou motivo.
 */
export function consolidatedTesteAlterado(prs: readonly PrBody[]): string | null {
  const parts = prs
    .map((pr) => ({ number: pr.number, reason: findReason(pr.body) }))
    .filter((p): p is { number: number; reason: string } => p.reason !== null)
    .map((p) => `#${p.number} ${p.reason.replace(/;/g, ',')}`);
  return parts.length === 0 ? null : `TESTE-ALTERADO: ${parts.join('; ')}`;
}

/** Worktree limpo do gate, ao lado do clone (nunca dentro dele, para o lint e o git não o verem). */
export const worktreePath = (repoRoot: string, version: string): string =>
  join(dirname(repoRoot), `${basename(repoRoot)}-cut-${tagFor(version)}`);

export interface ReleasePrInput {
  version: string;
  receipt: string;
  prs: readonly number[];
  testeAlterado: string | null;
}

/** Corpo do PR `release/vX.Y.Z → main`, no formato do template e com o recibo do gate da release. */
export function releasePrBody(input: ReleasePrInput): string {
  const tag = tagFor(input.version);
  const lote = input.prs.length === 0 ? 'nenhum PR identificado no log' : input.prs.map((n) => `#${n}`).join(', ');
  return [
    '## O que muda',
    '',
    `Release ${tag} para a \`main\` (ADR-052), cortada por \`npm run release:cut\` (ADR-071). Lote: ${lote}.`,
    'Merge **commit** (nunca squash nem rebase). Depois: backup, `npm run release:publish` e deploy da tag.',
    '',
    '## Como validar',
    '',
    'Gate da release rodado uma vez em worktree limpo, no SHA final (sem commit depois do `release:prepare`):',
    '',
    input.receipt,
    '',
    '## Homologação',
    '',
    `Seed: n/a — release; cada PR do lote trouxe o seu cenário e a staging foi aprovada (\`${approvalBranch(input.version)}\`).`,
    'Cenários: n/a — homologados por PR na staging antes do corte.',
    '',
    input.testeAlterado ?? '',
  ]
    .join('\n')
    .trimEnd()
    .concat('\n');
}
