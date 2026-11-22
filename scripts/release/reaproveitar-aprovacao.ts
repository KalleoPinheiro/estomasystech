/**
 * `tsx scripts/release/reaproveitar-aprovacao.ts --base <sha> --head <sha> --pr <n> --repo <dono/nome> --branch <ref>`
 *
 * Roda no job `risco` do `portao-risco.yml`, vindo do checkout da base, só quando a classe é 3 (ADR-117).
 * Procura uma execução anterior do portão nesta PR que o dono aprovou no Environment `aprovacao-classe-3` e cujo
 * head tem a mesma impressão de classe 3 que o head atual. Achou: imprime `reaproveitada=true` e o link da
 * execução aprovada; o job de aprovação é pulado. Não achou, ou qualquer erro: `reaproveitada=false` e o dono
 * clica como antes. Sai sempre com 0: a ausência de reaproveitamento é o caminho seguro, não uma falha.
 *
 * Lê a API com o `GITHUB_TOKEN` do job (`actions: read`). Nada do head é executado: o head entra só como objeto
 * de git, igual ao classificador.
 */
import { spawnSync } from 'node:child_process';
import {
  type Aprovacao,
  aprovadaPeloDono,
  type Execucao,
  execucaoDaPr,
  type Job,
  MAX_CANDIDATAS,
  type Reaproveitamento,
  saidaReaproveitamento,
  shaValido,
} from './reaproveitar-aprovacao-lib';
import { impressaoDoHead } from './reaproveitar-aprovacao-git';

function opcao(nome: string): string {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? '') : '';
}

const base = opcao('--base');
const head = opcao('--head');
const pr = Number(opcao('--pr'));
const repo = opcao('--repo');
const branch = opcao('--branch');
const api = process.env.GITHUB_API_URL || 'https://api.github.com';
const token = process.env.GITHUB_TOKEN ?? '';

async function ler<T>(caminho: string): Promise<T> {
  const r = await fetch(`${api}/repos/${repo}${caminho}`, {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
  });
  if (!r.ok) throw new Error(`GET ${caminho}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

function garantirCommit(sha: string): boolean {
  const tem = () => spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`]).status === 0;
  if (tem()) return true;
  spawnSync('git', ['fetch', '--no-tags', '--quiet', 'origin', sha]);
  return tem();
}

async function aprovadas(): Promise<Execucao[]> {
  const q = `event=pull_request&per_page=50&branch=${encodeURIComponent(branch)}`;
  const { workflow_runs } = await ler<{ workflow_runs: Execucao[] }>(`/actions/workflows/portao-risco.yml/runs?${q}`);
  const daPr = workflow_runs.filter((e) => execucaoDaPr(e, pr));
  const saida: Execucao[] = [];
  for (const e of daPr) {
    if (saida.length >= MAX_CANDIDATAS) break;
    const { jobs } = await ler<{ jobs: Job[] }>(`/actions/runs/${e.id}/jobs?per_page=100`);
    const registro = await ler<Aprovacao[]>(`/actions/runs/${e.id}/approvals`);
    if (aprovadaPeloDono(jobs, registro)) saida.push(e);
  }
  return saida;
}

async function decidir(): Promise<Reaproveitamento> {
  if (!shaValido(base) || !shaValido(head) || !Number.isInteger(pr) || pr <= 0 || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !branch) {
    return { reaproveitada: false, motivo: 'argumentos inválidos' };
  }
  const atual = impressaoDoHead(base, head);
  if (!atual) return { reaproveitada: false, motivo: 'sem impressão de classe 3 para o head atual' };
  for (const e of await aprovadas()) {
    if (garantirCommit(e.head_sha) && impressaoDoHead(base, e.head_sha) === atual) {
      return { reaproveitada: true, origem: e.html_url, motivo: `mesmo conteúdo de classe 3 aprovado em ${e.head_sha}` };
    }
  }
  return { reaproveitada: false, motivo: 'nenhuma aprovação anterior com o mesmo conteúdo de classe 3' };
}

const resultado = await decidir().catch((erro: unknown) => ({
  reaproveitada: false,
  motivo: `falha ao consultar aprovações anteriores: ${erro instanceof Error ? erro.message : String(erro)}`,
}));
console.error(`reaproveitamento: ${resultado.motivo}`);
console.log(saidaReaproveitamento(resultado));
