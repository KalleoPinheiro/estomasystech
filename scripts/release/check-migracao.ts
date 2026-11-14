/**
 * `npm run check:migracao [-- --base <ref>] [--head <ref>] [--json] [--exigir-aditiva] [--all]`
 *
 * Lint de migração aditiva: classifica as migrações `drizzle/*.sql` novas do diff (base...head) em aditiva ou
 * não aditiva e confere o journal (ordem de `when`, idx, arquivo por tag, só acrescenta). Regras e formato da
 * saída em `check-migracao-lib.ts` e em `docs/engineering/migracoes-aditivas.md`.
 *
 * Sem `--head`, a ponta é `HEAD` e SQL/journal saem da árvore de trabalho. Com `--head`, saem de `git cat-file`
 * nesse commit (o workflow roda este script a partir do checkout da base). O diff usa `-z`: nome com acento,
 * espaço, aspas ou quebra de linha não fica entre aspas do `core.quotePath`.
 *
 * - `--json`: imprime só o relatório em JSON (`schema: "check-migracao/v1"`), para o classificador de risco.
 * - `--exigir-aditiva`: sai com 1 também quando a migração é não aditiva (por padrão só erro estrutural reprova,
 *   porque migração não aditiva é decisão humana de classe 3, não defeito).
 * - `--all`: classifica todas as migrações, não só as do diff.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { detectBase } from '../gate/base';
import { codigoDeSaida, type EntradaJournal, formatarRelatorio, verificar } from './check-migracao-lib';
import { arquivosDeNul, mudancasDeNul } from './diff-nul';

const MIGRACAO = /^drizzle\/[^/]+\.sql$/;
const JOURNAL = 'drizzle/meta/_journal.json';
const DIFF = [
  '-c',
  'core.quotePath=false',
  'diff',
  '--name-status',
  '-z',
  '--no-renames',
  '--no-ext-diff',
  '--no-textconv',
] as const;

function git(args: readonly string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? '' };
}

const flag = (nome: string): boolean => process.argv.includes(nome);

function opcao(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const lerJournal = (texto: string): EntradaJournal[] => (JSON.parse(texto) as { entries: EntradaJournal[] }).entries;

function texto(rev: string | undefined, caminho: string): string {
  if (!rev) return readFileSync(caminho, 'utf8');
  const r = git(['cat-file', 'blob', `${rev}:${caminho}`]);
  if (!r.ok) {
    console.error(`✗ não li ${caminho} em ${rev}`);
    process.exit(1);
  }
  return r.out;
}

function nomesSql(rev: string | undefined): string[] {
  if (!rev) return readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort();
  const r = git(['ls-tree', '-r', '-z', '--name-only', rev, '--', 'drizzle']);
  if (!r.ok) {
    console.error(`✗ git ls-tree ${rev} drizzle falhou`);
    process.exit(1);
  }
  return arquivosDeNul(r.out)
    .filter((caminho) => MIGRACAO.test(caminho))
    .map((caminho) => caminho.slice('drizzle/'.length))
    .sort();
}

const base = opcao('--base') ?? detectBase(process.env.GATE_BASE || undefined);
const head = opcao('--head');
const diff = git([...DIFF, `${base}...${head ?? 'HEAD'}`, '--', 'drizzle']);
if (!diff.ok) {
  console.error(`✗ git diff contra ${base} falhou; rode \`git fetch origin\` ou passe --base <ref>`);
  process.exit(1);
}
const mudancas = mudancasDeNul(diff.out).filter(([, caminho]) => MIGRACAO.test(caminho));
const sql = nomesSql(head);
const baseJournal = git(['cat-file', 'blob', `${base}:${JOURNAL}`]);

const relatorio = verificar({
  base,
  journal: lerJournal(texto(head, JOURNAL)),
  journalBase: baseJournal.ok ? lerJournal(baseJournal.out) : null,
  arquivosSql: sql,
  analisar: flag('--all') ? sql.map((nome) => `drizzle/${nome}`) : mudancas.filter(([s]) => s === 'A').map(([, c]) => c),
  alterados: mudancas.filter(([s]) => s !== 'A').map(([, c]) => c),
  lerSql: (caminho) => texto(head, caminho),
});

console.log(flag('--json') ? JSON.stringify(relatorio, null, 2) : formatarRelatorio(relatorio));
process.exit(codigoDeSaida(relatorio, flag('--exigir-aditiva')));
