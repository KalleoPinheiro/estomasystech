/**
 * Base do diff dos gates locais (ADR-058). O PR `feat/* → release/vX.Y.Z` deve ser comparado com a
 * release aberta, não com a `main`: contra a `main` o diff traz o que outros PRs já levaram à
 * release, e a regra 8 acusa teste alterado por quem não é este PR. O PR `release/*` ou `hotfix/*
 * → main` continua comparado com a `main`.
 */
import { spawnSync } from 'node:child_process';

export const MAIN_REF = 'origin/main';
const RELEASE_REF = /^origin\/release\/v(\d+)\.(\d+)\.(\d+)$/;
/** Branches cujo PR vai direto para a `main`. */
const TO_MAIN_BRANCH = /^(main|staging|release\/.+|hotfix\/.+)$/;

const versionOf = (ref: string): number[] => (RELEASE_REF.exec(ref) ?? []).slice(1).map(Number);

function newestFirst(a: string, b: string): number {
  const [va, vb] = [versionOf(a), versionOf(b)];
  const i = vb.findIndex((n, k) => n !== va[k]);
  return i < 0 ? 0 : vb[i] - va[i];
}

export interface BaseInput {
  /** `GATE_BASE` ou argumento explícito: sempre vence. */
  explicit?: string;
  branch: string;
  /** Releases abertas (`origin/release/vX.Y.Z`) das quais o HEAD descende e que a `main` ainda não tem. */
  openReleases: string[];
}

/** Escolhe a base do diff: explícita; `main` para release/hotfix; senão a release aberta mais nova. */
export function resolveBase({ explicit, branch, openReleases }: BaseInput): string {
  if (explicit) return explicit;
  if (TO_MAIN_BRANCH.test(branch)) return MAIN_REF;
  return openReleases.filter((r) => RELEASE_REF.test(r)).sort(newestFirst)[0] ?? MAIN_REF;
}

function git(...args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout.trim() };
}

const isAncestor = (ancestor: string, of: string): boolean =>
  git('merge-base', '--is-ancestor', ancestor, of).ok;

/** Lê o git local: branch atual e releases remotas ainda não mergeadas na `main`. */
export function detectBase(explicit?: string): string {
  const releases = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/release/')
    .out.split('\n')
    .filter(Boolean)
    .filter((ref) => isAncestor(ref, 'HEAD') && !isAncestor(ref, MAIN_REF));
  return resolveBase({
    explicit: explicit ?? (process.env.GATE_BASE || undefined),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD').out,
    openReleases: releases,
  });
}

if (process.argv[1]?.endsWith('scripts/gate/base.ts')) console.log(detectBase());
