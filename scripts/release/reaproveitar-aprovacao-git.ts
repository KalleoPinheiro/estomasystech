/**
 * Impressão do conteúdo de classe 3 de um head (ADR-117). Roda o classificador da base sobre o head como objeto
 * (`--head`, sem checkout) e tira o `git patch-id --verbatim` do diff `base...head` restrito aos arquivos que
 * explicam a classe. `--verbatim` não ignora espaço em branco; o patch-id ignora só número de linha, então um
 * merge da `main` que desloca o arquivo não muda a impressão.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { ResultadoRisco } from './classificar-risco-lib';
import { arquivosDaImpressao, impressao } from './reaproveitar-aprovacao-lib';

/** Raiz do checkout da base: o CLI roda dela (o tsx desta versão compila para CJS, sem `import.meta`). */
const RAIZ = process.cwd();
const TSX = path.join(RAIZ, 'node_modules', '.bin', 'tsx');
const CLASSIFICADOR = path.join(RAIZ, 'scripts', 'release', 'classificar-risco.ts');
const AMBIENTE = { ...process.env, npm_config_offline: 'true' };
const BUFFER = 64 * 1024 * 1024;

function classificar(base: string, head: string, cwd: string): ResultadoRisco | null {
  const r = spawnSync(TSX, [CLASSIFICADOR, '--json', '--base', base, '--head', head], {
    cwd,
    encoding: 'utf8',
    maxBuffer: BUFFER,
    env: AMBIENTE,
  });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout) as ResultadoRisco;
  } catch {
    return null;
  }
}

function patchId(base: string, head: string, arquivos: readonly string[], cwd: string): string {
  const diff = spawnSync(
    'git',
    ['-c', 'core.quotePath=false', 'diff', '--no-renames', '--no-ext-diff', '--no-textconv', '--binary', `${base}...${head}`, '--', ...arquivos],
    { cwd, encoding: 'utf8', maxBuffer: BUFFER, env: AMBIENTE },
  );
  if (diff.status !== 0 || diff.stdout === '') return '';
  const id = spawnSync('git', ['patch-id', '--verbatim'], { cwd, input: diff.stdout, encoding: 'utf8', maxBuffer: BUFFER });
  return id.status === 0 ? id.stdout : '';
}

/** Impressão do head contra a base, ou `null` (classe abaixo de 3, motivo sem arquivo, erro de git). */
export function impressaoDoHead(base: string, head: string, cwd = process.cwd()): string | null {
  const resultado = classificar(base, head, cwd);
  if (!resultado) return null;
  const arquivos = arquivosDaImpressao(resultado);
  if (!arquivos) return null;
  return impressao(resultado, patchId(base, head, arquivos, cwd));
}
