/**
 * Regras puras do reaproveitamento da aprovação de classe 3 (ADR-117).
 *
 * Por quê: o clique do dono no Environment `aprovacao-classe-3` valia por execução. Um merge da `main` na branch
 * (conflito em arquivo que não é sensível) pedia outro clique para o mesmo conteúdo sensível. Aqui a aprovação
 * passa a valer para a **impressão** do conteúdo de classe 3: os motivos da classe e o `git patch-id` do diff
 * restrito aos arquivos que a explicam. Mesmo conteúdo sensível, mesma impressão, sem clique novo; qualquer byte
 * a mais ou a menos nesses arquivos, impressão nova, clique novo.
 *
 * Falha fechada: qualquer motivo sem arquivo, classe abaixo de 3, execução sem registro de aprovação do
 * Environment ou leitura incompleta da API dá `null`/`false`, e o dono clica como antes.
 */
import { createHash } from 'node:crypto';
import type { ResultadoRisco } from './classificar-risco-lib';

export const NOME_JOB_APROVACAO = 'Aprovação do dono (classe 3)';
export const AMBIENTE_APROVACAO = 'aprovacao-classe-3';
/** Quantas execuções aprovadas, da mais nova para a mais antiga, o CLI compara antes de desistir. */
export const MAX_CANDIDATAS = 10;

const SHA = /^[0-9a-f]{40}$/;

export const shaValido = (sha: string): boolean => SHA.test(sha);

/**
 * Arquivos cujo diff entra na impressão: os que explicam a classe 3. Dependência sensível pode vir só do
 * lockfile (o motivo cita `package.json`), então o lockfile entra junto. `null` quando a classe não é 3 ou
 * algum motivo não aponta arquivo (ex.: `diff-vazio-com-head`).
 */
export function arquivosDaImpressao(r: ResultadoRisco): string[] | null {
  if (r.classe !== 3 || r.motivos.length === 0) return null;
  const arquivos = new Set<string>();
  for (const m of r.motivos) {
    if (m.classe !== 3 || !m.arquivo) return null;
    arquivos.add(m.arquivo);
    if (m.regra === 'dependencia-sensivel') arquivos.add('package-lock.json');
  }
  return [...arquivos].sort();
}

/** Impressão estável: motivos ordenados + patch-id. `null` sem patch-id (diff vazio nos arquivos). */
export function impressao(r: ResultadoRisco, patchId: string): string | null {
  const id = patchId.trim().split(/\s+/)[0] ?? '';
  if (!shaValido(id)) return null;
  const motivos = r.motivos.map((m) => `${m.regra}\u0000${m.arquivo ?? ''}\u0000${m.detalhe}`).sort();
  return createHash('sha256').update(JSON.stringify({ motivos, patchId: id })).digest('hex');
}

export interface Execucao {
  id: number;
  head_sha: string;
  html_url: string;
  event?: string;
  pull_requests?: readonly { number: number }[] | null;
}

export interface Job {
  name: string;
  conclusion: string | null;
}

export interface Aprovacao {
  state: string;
  environments?: readonly { name?: string }[] | null;
}

/** Execução do `pull_request` desta PR, com head válido. */
export function execucaoDaPr(e: Execucao, pr: number): boolean {
  return (
    e.event === 'pull_request' &&
    shaValido(e.head_sha) &&
    (e.pull_requests ?? []).some((p) => p.number === pr)
  );
}

/**
 * O dono aprovou esta execução: o job de aprovação terminou com sucesso **e** o histórico de revisão do
 * Environment registra `approved` em `aprovacao-classe-3`. Só o job verde não basta: um workflow alterado
 * poderia criar um job com o mesmo nome sem Environment.
 */
export function aprovadaPeloDono(jobs: readonly Job[], aprovacoes: readonly Aprovacao[]): boolean {
  const job = jobs.some((j) => j.name === NOME_JOB_APROVACAO && j.conclusion === 'success');
  const registro = aprovacoes.some(
    (a) => a.state === 'approved' && (a.environments ?? []).some((amb) => amb.name === AMBIENTE_APROVACAO),
  );
  return job && registro;
}

export interface Reaproveitamento {
  reaproveitada: boolean;
  origem?: string;
  motivo: string;
}

/** Linhas `chave=valor` para o `$GITHUB_OUTPUT`. A URL de origem é do próprio GitHub; nada vem do head. */
export function saidaReaproveitamento(r: Reaproveitamento): string {
  const linhas = [`reaproveitada=${r.reaproveitada}`];
  if (r.reaproveitada && r.origem && /^https:\/\/[^\s]+$/.test(r.origem)) linhas.push(`aprovacao_origem=${r.origem}`);
  return linhas.join('\n');
}
