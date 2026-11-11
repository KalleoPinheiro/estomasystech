/**
 * `npm run check:risco [-- --base <ref>] [--head <ref>] [--json] [--saida-github] [--migracao <arquivo.json>]`
 *
 * Classe de risco da PR (0 a 3) pelo diff base...head (ADR-097). Sai com 0 sempre que consegue classificar:
 * a classe é informação para o deploy e para a aprovação, não reprova a PR. Sai com 1 só se não conseguir ler
 * o diff. Regras em `classificar-risco-lib.ts`; formato e uso em `docs/engineering/classe-de-risco.md`.
 *
 * Sem `--head`, a ponta é `HEAD` e o conteúdo atual sai da árvore de trabalho (uso local, inclusive o que ainda
 * não foi commitado). Com `--head`, o conteúdo sai de `git cat-file` nesse commit: o workflow faz checkout da
 * base e passa o SHA da PR, então uma PR não rebaixa o próprio risco trocando este script.
 *
 * - `--json`: relatório `classificar-risco/v1`.
 * - `--saida-github`: linhas `classe=N` e `aprovacao_humana=true|false` (formato de `$GITHUB_OUTPUT`).
 * - `--migracao`: usa um `check-migracao/v1` já gerado em vez de rodar o `check:migracao`.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { detectBase } from '../gate/base';
import {
  classificarRisco,
  formatarRisco,
  lerRelatorioMigracao,
  type ManifestoLock,
  type ManifestoPacotes,
  pacotesAlterados,
  pacotesAlteradosLock,
  scriptsAlterados,
  saidaGithub,
} from './classificar-risco-lib';
import { arquivosDeNul } from './diff-nul';

function git(args: readonly string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? '' };
}

const flag = (nome: string): boolean => process.argv.includes(nome);

function opcao(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DIFF = [
  '-c',
  'core.quotePath=false',
  'diff',
  '--name-only',
  '-z',
  '--no-renames',
  '--no-ext-diff',
  '--no-textconv',
] as const;

function blob(rev: string, caminho: string): string | null {
  const r = git(['cat-file', 'blob', `${rev}:${caminho}`]);
  return r.ok ? r.out : null;
}

function lerDisco(caminho: string): string | null {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    return null;
  }
}

function exigir(texto: string | null, caminho: string, rev: string | undefined): string {
  if (texto !== null) return texto;
  console.error(`✗ não li ${caminho}${rev ? ` em ${rev}` : ''}`);
  process.exit(1);
}

/** JSON do `check:migracao`: do arquivo passado ou rodando o lint. Qualquer falha vira `null` (classe 3). */
function relatorioMigracao(base: string, head: string | undefined): ReturnType<typeof lerRelatorioMigracao> {
  try {
    const arquivo = opcao('--migracao');
    if (arquivo) return lerRelatorioMigracao(JSON.parse(readFileSync(arquivo, 'utf8')));
    const args = ['tsx', 'scripts/release/check-migracao.ts', '--json', '--base', base];
    if (head) args.push('--head', head);
    const r = spawnSync('npx', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return lerRelatorioMigracao(JSON.parse(r.stdout));
  } catch {
    return null;
  }
}

const base = opcao('--base') ?? detectBase(process.env.GATE_BASE || undefined);
const head = opcao('--head');
const diff = git([...DIFF, `${base}...${head ?? 'HEAD'}`]);
if (!diff.ok) {
  console.error(`✗ git diff contra ${base} falhou; rode \`git fetch origin\` ou passe --base <ref>`);
  process.exit(1);
}
const arquivos = arquivosDeNul(diff.out);

function atual(caminho: string): string {
  return exigir(head ? blob(head, caminho) : lerDisco(caminho), caminho, head);
}

const manifestoBase = git(['cat-file', 'blob', `${base}:package.json`]);
const pacotes = arquivos.includes('package.json')
  ? pacotesAlterados(
      manifestoBase.ok ? (JSON.parse(manifestoBase.out) as ManifestoPacotes) : null,
      JSON.parse(atual('package.json')) as ManifestoPacotes,
    )
  : [];

const manifestoAtual = arquivos.includes('package.json') ? (JSON.parse(atual('package.json')) as ManifestoPacotes) : null;
const scripts = manifestoAtual
  ? scriptsAlterados(manifestoBase.ok ? (JSON.parse(manifestoBase.out) as ManifestoPacotes) : null, manifestoAtual)
  : [];

const lockBase = git(['cat-file', 'blob', `${base}:package-lock.json`]);
const pacotesLock = arquivos.includes('package-lock.json')
  ? pacotesAlteradosLock(
      lockBase.ok ? (JSON.parse(lockBase.out) as ManifestoLock) : null,
      JSON.parse(atual('package-lock.json')) as ManifestoLock,
    )
  : [];

const resultado = classificarRisco({
  arquivos,
  migracao: arquivos.some((a) => a.startsWith('drizzle/')) ? relatorioMigracao(base, head) : null,
  pacotesAlterados: [...new Set([...pacotes, ...pacotesLock])],
  scriptsAlterados: scripts,
});

console.log(flag('--saida-github') ? saidaGithub(resultado) : flag('--json') ? JSON.stringify(resultado, null, 2) : formatarRisco(resultado));
