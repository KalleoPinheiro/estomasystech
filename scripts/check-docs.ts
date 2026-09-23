/**
 * Gate de documentação (`npm run check:docs`) — ver `docs/governance.md`.
 *
 * 1. Todo link relativo em `AGENTS.md`, `CONTEXT.md`, `README.md` e `docs/**`
 *    precisa resolver para um arquivo ou diretório existente. Ficam de fora:
 *    `docs/templates/**` (links relativos ao destino da cópia), URLs com
 *    esquema, âncoras puras e trechos de código.
 * 2. Todo `.md` em `docs/` abre com frontmatter YAML com `title`, `status`,
 *    `audience`, `owner` e `last_reviewed` (`YYYY-MM-DD`); `status` é um de
 *    `living`, `frozen`, `draft`, `superseded`.
 * 3. Doc `living` com `last_reviewed` a mais de 90 dias gera aviso (sai 0).
 *
 * Uso: `tsx scripts/check-docs.ts [raiz]` — sai 1 se houver erro.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const REQUIRED_KEYS = ['title', 'status', 'audience', 'owner', 'last_reviewed'];
const STATUSES = ['living', 'frozen', 'draft', 'superseded'];
const ROOT_FILES = ['AGENTS.md', 'CONTEXT.md', 'README.md'];
const STALE_AFTER_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Report {
  errors: string[];
  warnings: string[];
}

function listMarkdown(root: string, dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((entry) => {
    const rel = join(dir, entry);
    if (statSync(join(root, rel)).isDirectory()) return listMarkdown(root, rel);
    return rel.endsWith('.md') ? [rel] : [];
  });
}

function parseFrontmatter(text: string): Map<string, string> | null {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    const match = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (match) fields.set(match[1], match[2].replace(/\s+#.*$/, '').trim());
  }
  return fields;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function checkFrontmatter(file: string, text: string, report: Report): void {
  const fields = parseFrontmatter(text);
  if (!fields) {
    report.errors.push(`${file}: frontmatter ausente (bloco --- no topo)`);
    return;
  }
  for (const key of REQUIRED_KEYS) {
    if (!fields.get(key)) report.errors.push(`${file}: chave ausente no frontmatter: ${key}`);
  }
  const status = fields.get('status');
  if (status && !STATUSES.includes(status)) {
    report.errors.push(`${file}: status inválido '${status}' (use ${STATUSES.join(' | ')})`);
  }
  const reviewed = fields.get('last_reviewed');
  if (!reviewed) return;
  if (!isValidDate(reviewed)) {
    report.errors.push(`${file}: last_reviewed inválido '${reviewed}' (use YYYY-MM-DD)`);
    return;
  }
  const age = Math.floor((Date.now() - Date.parse(`${reviewed}T00:00:00Z`)) / DAY_MS);
  if (status === 'living' && age > STALE_AFTER_DAYS) {
    report.warnings.push(
      `aviso: ${file}: last_reviewed ${reviewed} há ${age} dias (> ${STALE_AFTER_DAYS}) — revise ou marque frozen/superseded`,
    );
  }
}

function isExternalOrAnchor(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#');
}

/** Links `[texto](alvo)` fora de blocos e trechos de código, com a linha. */
function extractLinks(text: string): Array<{ line: number; target: string }> {
  const links: Array<{ line: number; target: string }> = [];
  let inFence = false;
  text.split('\n').forEach((raw, index) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const line = raw.replace(/`[^`]*`/g, '');
    for (const match of line.matchAll(/\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ line: index + 1, target: match[1] });
    }
  });
  return links;
}

function checkLinks(root: string, file: string, text: string, report: Report): void {
  for (const { line, target } of extractLinks(text)) {
    if (isExternalOrAnchor(target)) continue;
    const path = decodeURIComponent(target.split(/[#?]/)[0]);
    const abs = path.startsWith('/') ? join(root, path) : resolve(root, dirname(file), path);
    if (!existsSync(abs)) report.errors.push(`${file}:${line} -> ${target} (não existe)`);
  }
}

function checkDocs(root: string): Report {
  const report: Report = { errors: [], warnings: [] };
  const docs = listMarkdown(root, 'docs');
  const rootFiles = ROOT_FILES.filter((f) => existsSync(join(root, f)));
  for (const file of [...rootFiles, ...docs]) {
    const text = readFileSync(join(root, file), 'utf8');
    if (file.startsWith('docs/')) checkFrontmatter(file, text, report);
    if (!file.startsWith('docs/templates/')) checkLinks(root, file, text, report);
  }
  return report;
}

function main(): void {
  const root = resolve(process.argv[2] ?? process.cwd());
  const { errors, warnings } = checkDocs(root);
  for (const warning of warnings) console.log(warning);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    console.error(`\ncheck:docs: ${errors.length} erro(s) em ${relative(process.cwd(), root) || '.'}`);
    process.exit(1);
  }
  console.log(`check:docs: OK (${warnings.length} aviso(s))`);
}

main();
