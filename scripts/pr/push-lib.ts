/**
 * Regras puras do `npm run pr:push -- <N>` (ADR-117). Por quê: um push de atualização foi para a branch errada e
 * o PR ficou 45 min sem mudar sem ninguém notar. O comando recusa empurrar quando o HEAD local não descende do
 * head atual do PR e, depois do push, só sai com 0 quando o head do PR é o HEAD local.
 */
const SHA = /^[0-9a-f]{40}$/;

export function numeroDoPr(arg: string | undefined): number | null {
  if (!arg || !/^[1-9]\d{0,6}$/.test(arg)) return null;
  return Number(arg);
}

/** Primeira coluna de `git ls-remote origin refs/pull/N/head`, ou `null`. */
export function shaDoLsRemote(saida: string): string | null {
  const sha = saida.trim().split(/\s+/)[0] ?? '';
  return SHA.test(sha) ? sha : null;
}

export interface AntesDoPush {
  branch: string;
  headLocal: string;
  headDoPr: string | null;
  descende: boolean;
}

/** Mensagem de recusa antes do push, ou `null` quando pode empurrar. */
export function recusaAntesDoPush(a: AntesDoPush): string | null {
  if (a.branch === 'HEAD' || a.branch === '') return 'HEAD destacado: troque para a branch do PR antes de empurrar';
  if (a.branch === 'main') return 'você está na main: troque para a branch do PR';
  if (!a.headDoPr) return 'não achei o head do PR no origin (número errado?)';
  if (a.headDoPr === a.headLocal) return null;
  if (!a.descende) {
    return `o HEAD local (${a.headLocal.slice(0, 7)}) não descende do head do PR (${a.headDoPr.slice(0, 7)}): branch errada ou falta git pull`;
  }
  return null;
}

/** Mensagem de erro depois do push, ou `null` quando o PR já aponta para o HEAD local. */
export function erroDepoisDoPush(pr: number, branch: string, headLocal: string, headDoPr: string | null): string | null {
  if (headDoPr === headLocal) return null;
  return `o PR #${pr} aponta para ${headDoPr?.slice(0, 7) ?? '(nada)'}, mas o push de ${headLocal.slice(0, 7)} foi para a branch ${branch}: confira a branch do PR`;
}
