/**
 * Regra 8 sobre as configurações que afrouxam o gate (#732): compara o conteúdo ESTRUTURADO da
 * base com o do HEAD, não linhas de diff. Funções puras: quem lê o git é `check-test-integrity.ts`.
 * Falha fechada: arquivo da base ausente no HEAD (apagado ou renomeado), ilegível ou com limite
 * que deixou de ser literal é `hard`; mudança não proibida em lint/gate pede `GATE-ALTERADO:`.
 */
import type { Finding, Severity } from './test-integrity';

export interface ConfigPair {
  file: string;
  /** Conteúdo na base; `null` se o arquivo não existia (então não há o que proteger). */
  base: string | null;
  /** Conteúdo no HEAD; `null` se o arquivo sumiu (apagado ou renomeado). */
  head: string | null;
}

const TS_CONFIG = /^(vitest(\.[a-z]+)?\.config\.mts|playwright(\.[a-z]+)?\.config\.ts)$/;
const WORKFLOW = /^\.github\/workflows\/(ci|gate-pr)\.yml$/;

/** Arquivos que `check-test-integrity.ts` lê da base e do HEAD. */
export function isGatedConfig(path: string): boolean {
  return (
    TS_CONFIG.test(path) || path === 'stryker.config.json' || path === 'biome.json' || WORKFLOW.test(path)
  );
}

type Push = (rule: string, severity: Severity, line: string, gate?: boolean) => void;

/** JSON com comentários e vírgula sobrando (biome.json é JSONC): tira ambos fora das strings. */
export function parseJsonc(text: string): unknown {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && next === '*') {
      i = text.indexOf('*/', i + 2);
      if (i < 0) throw new Error('comentário sem fim');
      i++;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const asNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function strykerFindings(base: unknown, head: unknown, push: Push): void {
  const b = obj(base);
  const h = obj(head);
  const baseBreak = asNumber(obj(b.thresholds).break);
  const headBreak = asNumber(obj(h.thresholds).break);
  if (baseBreak !== undefined) {
    if (headBreak === undefined) push('limiar-de-mutacao-removido', 'hard', 'thresholds.break');
    else if (headBreak < baseBreak) push('limiar-de-mutacao-reduzido', 'hard', `break: ${baseBreak} → ${headBreak}`);
  }
  const baseTimeout = asNumber(b.timeoutMS);
  const headTimeout = asNumber(h.timeoutMS);
  if (headTimeout !== undefined && (baseTimeout === undefined || headTimeout > baseTimeout))
    push('retry-ou-timeout-aumentado', 'hard', `timeoutMS: ${baseTimeout} → ${headTimeout}`);
  const before = strings(b.mutate);
  const after = new Set(strings(h.mutate));
  for (const e of before) if (!e.startsWith('!') && !after.has(e)) push('mutacao-escopo-reduzido', 'hard', e);
  const had = new Set(before);
  for (const e of after) if (e.startsWith('!') && !had.has(e)) push('mutacao-escopo-reduzido', 'hard', e);
}

const LEVELS = new Set(['error', 'warn', 'off']);
interface LintCounts {
  error: Map<string, number>;
  loose: Map<string, number>;
  on: Map<string, number>;
  off: Map<string, number>;
}
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** Conta, por caminho sem índice de array, regras em `error`, frouxas (`warn`/`off`) e `enabled`. */
function lintCounts(node: unknown, path: string, c: LintCounts): LintCounts {
  if (typeof node === 'string' && LEVELS.has(node)) bump(node === 'error' ? c.error : c.loose, path);
  else if (typeof node === 'boolean' && path.endsWith('.enabled')) bump(node ? c.on : c.off, path);
  else if (Array.isArray(node)) {
    if (typeof node[0] === 'string' && LEVELS.has(node[0])) lintCounts(node[0], path, c);
    else for (const n of node) lintCounts(n, `${path}[]`, c);
  } else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) lintCounts(v, `${path}.${k}`, c);
  return c;
}
const emptyCounts = (): LintCounts => ({ error: new Map(), loose: new Map(), on: new Map(), off: new Map() });

function biomeFindings(base: unknown, head: unknown, push: Push): void {
  const b = lintCounts(base, '', emptyCounts());
  const h = lintCounts(head, '', emptyCounts());
  for (const [path, n] of b.error)
    if ((h.error.get(path) ?? 0) < n) push('regra-de-lint-rebaixada-ou-removida', 'hard', path);
  for (const [path, n] of b.on)
    if ((h.on.get(path) ?? 0) < n) push('regra-de-lint-desligada', 'hard', path);
  for (const [path, n] of h.loose)
    if (n > (b.loose.get(path) ?? 0)) push('regra-de-lint-nao-estrita', 'justifiable', path, true);
  for (const [path, n] of h.off)
    if (n > (b.off.get(path) ?? 0)) push('regra-de-lint-nao-estrita', 'justifiable', path, true);
}

const THRESHOLDS = /\b(lines|functions|branches|statements)\s*:\s*([^,}\n]+)/g;
const LIMITS = /\b(retries|timeout|testTimeout|hookTimeout)\s*:\s*([^,}\n]+)/g;

/** Valores por chave, do maior para o menor; `NaN` marca valor que não é literal numérico. */
function valuesByKey(text: string, re: RegExp): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const m of text.matchAll(re)) {
    const raw = (m[2] ?? '').trim().replaceAll('_', '');
    const list = out.get(m[1] ?? '') ?? [];
    list.push(/^\d+(\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN);
    out.set(m[1] ?? '', list);
  }
  for (const list of out.values()) list.sort((x, y) => y - x);
  return out;
}

function tsFindings(base: string, head: string, push: Push): void {
  const bt = valuesByKey(base, THRESHOLDS);
  const ht = valuesByKey(head, THRESHOLDS);
  for (const [key, before] of bt) {
    const after = ht.get(key) ?? [];
    const baseNums = before.filter((n) => !Number.isNaN(n));
    if (baseNums.length > after.length) push('limiar-de-cobertura-removido', 'hard', key);
    else if (after.some(Number.isNaN)) push('limiar-de-cobertura-nao-literal', 'hard', key);
    else if (baseNums.some((n, i) => (after[i] ?? 0) < n)) push('limiar-de-cobertura-reduzido', 'hard', key);
  }
  const bl = valuesByKey(base, LIMITS);
  for (const [key, after] of valuesByKey(head, LIMITS)) {
    const before = bl.get(key) ?? [];
    const grew = after.length > before.length || after.some((n, i) => Number.isNaN(n) || n > (before[i] ?? 0));
    if (grew && !after.every((n) => n === 0)) push('retry-ou-timeout-aumentado', 'hard', key);
  }
}

const SHARD_LIST = /\bshard\s*:\s*\[([^\]]*)\]/g;
const SHARD_FLAG = /--shard=[^\n]*?\/(\d+)/g;

function workflowFindings(base: string, head: string, push: Push): void {
  const lists = (t: string) =>
    [...t.matchAll(SHARD_LIST)].map((m) => (m[1] ?? '').split(',').filter((x) => x.trim()).length).sort((x, y) => y - x);
  const flags = (t: string) => [...t.matchAll(SHARD_FLAG)].map((m) => Number(m[1])).sort((x, y) => y - x);
  for (const [bs, hs] of [
    [lists(base), lists(head)],
    [flags(base), flags(head)],
  ] as const)
    if (bs.some((n, i) => (hs[i] ?? 0) < n)) push('shard-removido', 'hard', `${bs.join(',')} → ${hs.join(',')}`);
}

function compare(pair: ConfigPair, base: string, head: string, push: Push): void {
  const { file } = pair;
  if (file === 'stryker.config.json' || file === 'biome.json') {
    let parsedHead: unknown;
    try {
      parsedHead = parseJsonc(head);
    } catch {
      push('config-do-gate-ilegivel', 'hard', file);
      return;
    }
    const parsedBase = parseJsonc(base);
    if (file === 'biome.json') biomeFindings(parsedBase, parsedHead, push);
    else strykerFindings(parsedBase, parsedHead, push);
  } else if (WORKFLOW.test(file)) workflowFindings(base, head, push);
  else tsFindings(base, head, push);
}

/** Julga cada config da base contra o HEAD. Só arquivo que mudou entra na análise. */
export function analyzeConfigs(pairs: ConfigPair[]): Finding[] {
  const out: Finding[] = [];
  for (const pair of pairs) {
    if (pair.base === null || pair.base === pair.head) continue;
    const push: Push = (rule, severity, line, gate) =>
      out.push({ file: pair.file, rule, severity, line, ...(gate ? { kind: 'gate' as const } : {}) });
    if (pair.head === null) push('config-do-gate-removida', 'hard', pair.file);
    else
      try {
        compare(pair, pair.base, pair.head, push);
      } catch {
        push('config-do-gate-ilegivel', 'hard', pair.file);
      }
  }
  return out;
}
