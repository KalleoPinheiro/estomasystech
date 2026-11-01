/**
 * Pré-voo do `release:cut` (ADR-088): checagens baratas do que, nos cortes de 2026-11-01, derrubou o gate de
 * ~42 min só no fim (segredo ausente, identidade git, input de branch, rollback). A regra de cada item mora
 * aqui para ser testada; `preflight.ts` só lê o ambiente.
 */
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
}

export type Falhas = string[];

export function pendenciasDoPreflight(e: PreflightEnv): Falhas {
  const falhas: Falhas = [];
  if (!e.rollbackOk) falhas.push('rollback ausente ou inválido: use --rollback=redeploy ou --rollback=backup (ADR-039).');
  if (e.emCi && e.token === '') falhas.push('RELEASE_CUT_TOKEN ausente (GH_TOKEN vazio): o push do commit de versão e o PR precisam do PAT do dono.');
  if (e.repo === '') falhas.push('repositório desconhecido: defina GH_REPO ou GITHUB_REPOSITORY.');
  if (e.gitName === '' || e.gitEmail === '')
    falhas.push('identidade git ausente: defina user.name/user.email ou GIT_COMMITTER_NAME/GIT_COMMITTER_EMAIL antes do release:prepare.');
  return falhas;
}
