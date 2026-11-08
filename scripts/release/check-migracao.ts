/**
 * `npm run check:migracao [-- --base <ref>] [--json] [--exigir-aditiva] [--all]`
 *
 * Lint de migração aditiva: classifica as migrações `drizzle/*.sql` novas do diff (base...HEAD) em aditiva ou
 * não aditiva e confere o journal (ordem de `when`, idx, arquivo por tag, só acrescenta). Regras e formato da
 * saída em `check-migracao-lib.ts` e em `docs/engineering/migracoes-aditivas.md`.
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

const MIGRACAO = /^drizzle\/[^/]+\.sql$/;
const JOURNAL = 'drizzle/meta/_journal.json';

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

const base = opcao('--base') ?? detectBase(process.env.GATE_BASE || undefined);

const diff = git(['diff', '--name-status', '--no-renames', `${base}...HEAD`, '--', 'drizzle']);
if (!diff.ok) {
  console.error(`✗ git diff contra ${base} falhou; rode \`git fetch origin\` ou passe --base <ref>`);
  process.exit(1);
}
const mudancas = diff.out
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split('\t') as [string, string])
  .filter(([, caminho]) => MIGRACAO.test(caminho));

const todos = readdirSync('drizzle')
  .filter((f) => f.endsWith('.sql'))
  .sort();
const baseJournal = git(['show', `${base}:${JOURNAL}`]);

const relatorio = verificar({
  base,
  journal: lerJournal(readFileSync(JOURNAL, 'utf8')),
  journalBase: baseJournal.ok ? lerJournal(baseJournal.out) : null,
  arquivosSql: todos,
  analisar: flag('--all') ? todos.map((f) => `drizzle/${f}`) : mudancas.filter(([s]) => s === 'A').map(([, c]) => c),
  alterados: mudancas.filter(([s]) => s !== 'A').map(([, c]) => c),
  lerSql: (caminho) => readFileSync(caminho, 'utf8'),
});

console.log(flag('--json') ? JSON.stringify(relatorio, null, 2) : formatarRelatorio(relatorio));
process.exit(codigoDeSaida(relatorio, flag('--exigir-aditiva')));
