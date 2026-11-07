/**
 * Pré-voo do `release:cut` (ADR-088): checagens baratas do que, nos cortes de 2026-11-01, derrubou o gate de
 * ~42 min só no fim (segredo ausente, identidade git, input de branch, rollback). A regra de cada item mora
 * aqui para ser testada; `preflight.ts` só lê o ambiente.
 */
import { conferirNpm } from './lockfile-lib';
import { checkVersionForBranch, versionFromReleaseBranch } from './lib';

export interface PreflightEnv {
  /** `GH_TOKEN` do corte (PAT do dono). */
  token: string;
  /** `GH_REPO`/`GITHUB_REPOSITORY`. */
  repo: string;
  /** Identidade que o `git commit` do `release:prepare` vai usar. */
  gitName: string;
  gitEmail: string;
  /** Rollback pedido (`--rollback=`), já validado por `parseRollback`. */
  rollbackOk: boolean;
  /** Em Actions (`CI`) o token é obrigatório; no WSL o `gh` pode estar logado e dispensa a variável. */
  emCi: boolean;
  /** npm em uso versus o fixado em `packageManager` (ADR-091); ausente = não conferir. */
  npm?: { pkg: { packageManager?: string }; atual: string };
  /**
   * Disparo no Actions (ADR-092): ref do workflow (`GITHUB_REF`) e branch pedida (`RELEASE_BRANCH`, do input).
   * O corte só vale disparado da `main` (a definição do workflow vem da ref protegida) e com `release/vX.Y.Z`.
   * Ausente = corte local, onde `assertBranch` já confere a branch.
   */
  disparo?: { workflowRef: string; branch: string };
}

export type Falhas = string[];

export function pendenciasDoPreflight(e: PreflightEnv): Falhas {
  const falhas: Falhas = [];
  if (!e.rollbackOk) falhas.push('rollback ausente ou inválido: use --rollback=redeploy ou --rollback=backup (ADR-039).');
  if (e.emCi && e.token === '') falhas.push('RELEASE_CUT_TOKEN ausente (GH_TOKEN vazio): o push do commit de versão e o PR precisam do PAT do dono.');
  if (e.repo === '') falhas.push('repositório desconhecido: defina GH_REPO ou GITHUB_REPOSITORY.');
  if (e.gitName === '' || e.gitEmail === '')
    falhas.push('identidade git ausente: defina user.name/user.email ou GIT_COMMITTER_NAME/GIT_COMMITTER_EMAIL antes do release:prepare.');
  if (e.disparo) {
    if (e.disparo.workflowRef !== 'refs/heads/main')
      falhas.push(
        `o corte deve ser disparado da main (ref do workflow: ${e.disparo.workflowRef || 'vazia'}); informe a release no input branch (ADR-092).`,
      );
    if (versionFromReleaseBranch(e.disparo.branch) === null)
      falhas.push(`branch de corte inválida: ${JSON.stringify(e.disparo.branch)}; use release/vX.Y.Z (ADR-092).`);
  }
  const npm = e.npm ? conferirNpm(e.npm.pkg, e.npm.atual) : null;
  if (npm !== null) falhas.push(npm);
  return falhas;
}

/**
 * Resultado da simulação do `changeset version` (EST-23): sem changesets pendentes o `release:prepare` não
 * tem o que publicar; com eles, a versão calculada tem de ser a prometida pelo nome da release (ADR-052).
 * `null` = tudo certo.
 */
export function pendenciaDeVersao(
  branch: string,
  atual: string,
  simulada: { pendentes: number; calculada: string },
): string | null {
  if (simulada.pendentes === 0)
    return 'não há changesets pendentes: o release:prepare não teria o que publicar (adicione um `.changeset/*.md` com o nível da release).';
  const check = checkVersionForBranch(branch, atual, simulada.calculada);
  return check.ok ? null : `changesets incompatíveis com ${branch} (simulação do changeset version): ${check.reason}`;
}
