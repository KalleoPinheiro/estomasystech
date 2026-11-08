/**
 * `npm run check:risco [-- --base <ref>] [--json] [--saida-github] [--migracao <arquivo.json>]`
 *
 * Classe de risco da PR (0 a 3) pelo diff base...HEAD (ADR-097). Sai com 0 sempre que consegue classificar:
 * a classe é informação para o deploy e para a aprovação, não reprova a PR. Sai com 1 só se não conseguir ler
 * o diff. Regras em `classificar-risco-lib.ts`; formato e uso em `docs/engineering/classe-de-risco.md`.
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

function git(args: readonly string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? '' };
}

const flag = (nome: string): boolean => process.argv.includes(nome);

function opcao(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** JSON do `check:migracao`: do arquivo passado ou rodando o lint. Qualquer falha vira `null` (classe 3). */
function relatorioMigracao(base: string): ReturnType<typeof lerRelatorioMigracao> {
  try {
    const arquivo = opcao('--migracao');
    if (arquivo) return lerRelatorioMigracao(JSON.parse(readFileSync(arquivo, 'utf8')));
    const r = spawnSync('npx', ['tsx', 'scripts/release/check-migracao.ts', '--json', '--base', base], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return lerRelatorioMigracao(JSON.parse(r.stdout));
  } catch {
    return null;
  }
}

const base = opcao('--base') ?? detectBase(process.env.GATE_BASE || undefined);
const diff = git(['diff', '--name-only', '--no-renames', `${base}...HEAD`]);
if (!diff.ok) {
  console.error(`✗ git diff contra ${base} falhou; rode \`git fetch origin\` ou passe --base <ref>`);
  process.exit(1);
}
const arquivos = diff.out.split('\n').filter(Boolean);

const manifestoBase = git(['show', `${base}:package.json`]);
const pacotes = arquivos.includes('package.json')
  ? pacotesAlterados(
      manifestoBase.ok ? (JSON.parse(manifestoBase.out) as ManifestoPacotes) : null,
      JSON.parse(readFileSync('package.json', 'utf8')) as ManifestoPacotes,
    )
  : [];

const manifestoAtual = arquivos.includes('package.json')
  ? (JSON.parse(readFileSync('package.json', 'utf8')) as ManifestoPacotes)
  : null;
const scripts = manifestoAtual
  ? scriptsAlterados(manifestoBase.ok ? (JSON.parse(manifestoBase.out) as ManifestoPacotes) : null, manifestoAtual)
  : [];

const lockBase = git(['show', `${base}:package-lock.json`]);
const pacotesLock = arquivos.includes('package-lock.json')
  ? pacotesAlteradosLock(
      lockBase.ok ? (JSON.parse(lockBase.out) as ManifestoLock) : null,
      JSON.parse(readFileSync('package-lock.json', 'utf8')) as ManifestoLock,
    )
  : [];

const resultado = classificarRisco({
  arquivos,
  migracao: arquivos.some((a) => a.startsWith('drizzle/')) ? relatorioMigracao(base) : null,
  pacotesAlterados: [...new Set([...pacotes, ...pacotesLock])],
  scriptsAlterados: scripts,
});

console.log(flag('--saida-github') ? saidaGithub(resultado) : flag('--json') ? JSON.stringify(resultado, null, 2) : formatarRisco(resultado));
