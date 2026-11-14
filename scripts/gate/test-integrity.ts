/**
 * Integridade dos testes (regra 8 do AGENTS.md, ADR-042): detecta, de forma
 * determinística, a mudança que "resolve" um problema de desenvolvimento editando
 * o teste em vez do código. Funções puras: a mesma análise roda no hook do Claude
 * Code (antes da escrita), no `pre-push`, no `gate:local` e no CI (sobre o diff).
 *
 * Duas classes de achado:
 * - `hard`: nunca passa, nem com justificativa (teste desligado, limiar de
 *   cobertura reduzido, retry/timeout aumentado). Só o dono altera à mão.
 * - `justifiable`: asserção removida ou alterada, arquivo de teste apagado,
 *   configuração de teste alterada. Passa só com `TESTE-ALTERADO: <motivo de negócio>`.
 */

export type Severity = 'hard' | 'justifiable';

export interface Finding {
  file: string;
  rule: string;
  severity: Severity;
  line: string;
}

const TEST_FILE = /^(tests|e2e)\/.+\.(ts|tsx)$/;
const CONFIG_FILE = /^(vitest(\.[a-z]+)?\.config\.mts|playwright(\.[a-z]+)?\.config\.ts)$/;
/**
 * Configurações que afrouxam o gate mas que o agente também edita no dia a dia (lint, mutação, CI):
 * só o diff é julgado (CI e `pre-push`); o hook não as bloqueia.
 */
const GATE_SETTING_FILE = /^(stryker\.config\.json|biome\.json|\.github\/workflows\/(ci|gate-pr)\.yml)$/;
/** Arquivos que definem o próprio gate: só o dono muda (hook bloqueia o agente). */
const GATE_FILE = /^(\.claude\/(settings\.json|hooks\/.+)|\.husky\/.+|scripts\/gate\/.+)$/;

const ASSERTION =
  /\b(expect|assert)\b|\.(toBe|toEqual|toThrow|toMatch|toHaveText|toBeVisible|toHaveURL)\w*\(|^\s*(it|test|describe)(\.\w+)*\s*\(/;
/** Só no começo da instrução: o texto `it.skip(` dentro de string de fixture não conta. */
const DISABLED =
  /^\s*((it|test|describe)\.(skip|only|fixme|todo|fail|slow)\b|x(it|describe)\s*\(|test\.setTimeout\b)/;
const THRESHOLD = /^\s*(lines|functions|branches|statements)\s*:\s*(\d+)/;
const RETRY_OR_TIMEOUT = /^\s*(retries|timeout|testTimeout|hookTimeout)\s*:\s*([\d_]+)/;
const EXPECT_TIMEOUT = /\bexpect\s*:\s*\{\s*timeout\s*:\s*([\d_]+)/;

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path);
}

export function isConfigFile(path: string): boolean {
  return CONFIG_FILE.test(path);
}

export function isSettingFile(path: string): boolean {
  return GATE_SETTING_FILE.test(path);
}

export function isGateFile(path: string): boolean {
  return GATE_FILE.test(path);
}

function numberIn(line: string, re: RegExp, group: number): number | null {
  const m = re.exec(line);
  if (!m?.[group]) return null;
  return Number(m[group].replaceAll('_', ''));
}

interface Hunk {
  file: string;
  deleted: boolean;
  removed: string[];
  added: string[];
}

function parseDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const file = raw.split(' b/').at(-1) ?? '';
      current = { file, deleted: false, removed: [], added: [] };
      hunks.push(current);
    } else if (!current) {
      continue;
    } else if (raw.startsWith('deleted file mode')) {
      current.deleted = true;
    } else if (raw.startsWith('---') || raw.startsWith('+++')) {
      continue;
    } else if (raw.startsWith('-')) {
      current.removed.push(raw.slice(1));
    } else if (raw.startsWith('+')) {
      current.added.push(raw.slice(1));
    }
  }
  return hunks;
}

function configFindings(h: Hunk): Finding[] {
  const out: Finding[] = [];
  const push = (rule: string, severity: Severity, line: string) =>
    out.push({ file: h.file, rule, severity, line: line.trim() });
  const before = (re: RegExp) => h.removed.filter((l) => re.test(l));
  for (const line of h.added) {
    const t = THRESHOLD.exec(line);
    if (t) {
      const old = before(new RegExp(`^\\s*${t[1]}\\s*:`)).map((l) => numberIn(l, THRESHOLD, 2));
      if (old.some((n) => n !== null && n > Number(t[2])))
        push('limiar-de-cobertura-reduzido', 'hard', line);
    }
    const rt = RETRY_OR_TIMEOUT.exec(line);
    if (rt) {
      const key = rt[1];
      const old = before(new RegExp(`^\\s*${key}\\s*:`)).map((l) =>
        numberIn(l, RETRY_OR_TIMEOUT, 2),
      );
      const now = Number(rt[2].replaceAll('_', ''));
      if (old.length === 0 || old.some((n) => n !== null && n < now))
        push('retry-ou-timeout-aumentado', 'hard', line);
    }
    const et = EXPECT_TIMEOUT.exec(line);
    if (et) {
      const old = before(EXPECT_TIMEOUT).map((l) => numberIn(l, EXPECT_TIMEOUT, 1));
      if (old.some((n) => n !== null && n < Number(et[1].replaceAll('_', ''))))
        push('retry-ou-timeout-aumentado', 'hard', line);
    }
  }
  if (h.added.length + h.removed.length > 0 && out.length === 0)
    push('config-de-teste-alterada', 'justifiable', h.added[0] ?? h.removed[0] ?? '');
  return out;
}


const BREAK_THRESHOLD = /"break"\s*:\s*(\d+)/;
const MUTATION_TIMEOUT = /^\s*"timeoutMS"\s*:\s*(\d+)/;
const MUTATE_ENTRY = /^\s*"(!?[^"]+)"\s*,?\s*$/;
const LINT_LEVEL = /"(\w+)"\s*:\s*"(error|warn|off)"/;
const LINT_RANK: Record<string, number> = { error: 2, warn: 1, off: 0 };
const SHARD_LIST = /^\s*shard\s*:\s*\[([^\]]*)\]/;
const SHARD_FLAG = /--shard=.*\/(\d+)/;

const first = (lines: string[], re: RegExp, group = 1): number[] =>
  lines.flatMap((l) => {
    const m = re.exec(l);
    return m?.[group] ? [Number(m[group])] : [];
  });
const countItems = (list: string): number => list.split(',').filter((x) => x.trim()).length;

function settingFindings(h: Hunk): Finding[] {
  const out: Finding[] = [];
  const push = (rule: string, severity: Severity, line: string) =>
    out.push({ file: h.file, rule, severity, line: line.trim() });
  if (h.file === 'stryker.config.json') {
    for (const line of h.added) {
      const b = BREAK_THRESHOLD.exec(line);
      if (b && first(h.removed, BREAK_THRESHOLD).some((n) => n > Number(b[1])))
        push('limiar-de-mutacao-reduzido', 'hard', line);
      const t = MUTATION_TIMEOUT.exec(line);
      if (t && first(h.removed, MUTATION_TIMEOUT).some((n) => n < Number(t[1])))
        push('retry-ou-timeout-aumentado', 'hard', line);
      const e = MUTATE_ENTRY.exec(line);
      if (e?.[1]?.startsWith('!') && !h.removed.includes(line))
        push('mutacao-escopo-reduzido', 'hard', line);
    }
    for (const line of h.removed) {
      const e = MUTATE_ENTRY.exec(line);
      if (e?.[1] && !e[1].startsWith('!') && /[/*]/.test(e[1]) && !h.added.includes(line))
        push('mutacao-escopo-reduzido', 'hard', line);
    }
  } else if (h.file === 'biome.json') {
    for (const line of h.added) {
      const m = LINT_LEVEL.exec(line);
      if (!m?.[2] || m[2] === 'error') continue;
      const rank = LINT_RANK[m[2]] ?? 0;
      const olds = h.removed.flatMap((l) => {
        const o = LINT_LEVEL.exec(l);
        return o?.[1] === m[1] && o[2] ? [LINT_RANK[o[2]] ?? 0] : [];
      });
      if (olds.some((n) => n > rank)) push('regra-de-lint-rebaixada', 'hard', line);
      else if (olds.length === 0) push('regra-de-lint-nao-estrita', 'justifiable', line);
    }
  } else {
    for (const line of h.removed) {
      const list = SHARD_LIST.exec(line);
      if (list?.[1] !== undefined) {
        const now = h.added.flatMap((l) => SHARD_LIST.exec(l)?.[1] ?? []);
        if (now.length === 0 || now.every((n) => countItems(n) < countItems(list[1] ?? '')))
          push('shard-removido', 'hard', line);
      }
      const flag = SHARD_FLAG.exec(line);
      if (flag?.[1] && !first(h.added, SHARD_FLAG).some((n) => n >= Number(flag[1])))
        push('shard-removido', 'hard', line);
    }
  }
  return out;
}

/** Analisa um diff unificado (`git diff <base>...HEAD`) e devolve os achados. */
export function analyzeDiff(diff: string): Finding[] {
  const findings: Finding[] = [];
  for (const h of parseDiff(diff)) {
    if (isConfigFile(h.file)) {
      findings.push(...configFindings(h));
    } else if (isSettingFile(h.file)) {
      findings.push(...settingFindings(h));
    } else if (isTestFile(h.file)) {
      if (h.deleted) {
        findings.push({
          file: h.file,
          rule: 'arquivo-de-teste-removido',
          severity: 'justifiable',
          line: h.file,
        });
        continue;
      }
      for (const line of h.added.filter((l) => DISABLED.test(l)))
        findings.push({ file: h.file, rule: 'teste-desligado', severity: 'hard', line: line.trim() });
      for (const line of h.removed.filter((l) => ASSERTION.test(l)))
        findings.push({
          file: h.file,
          rule: 'asserção-removida-ou-alterada',
          severity: 'justifiable',
          line: line.trim(),
        });
    }
  }
  return findings;
}

export interface EditIntent {
  filePath: string;
  exists: boolean;
  oldString?: string;
  newString?: string;
  content?: string;
}

/**
 * Decide, antes da escrita, se uma edição do agente fere a regra 8. Arquivo de
 * teste novo passa; teste existente só aceita acréscimo (o trecho trocado não pode
 * conter asserção nem o novo desligar teste); config de teste e arquivos do gate
 * não são editáveis pelo agente.
 */
export function analyzeEdit(edit: EditIntent): Finding[] {
  const file = edit.filePath;
  if (isGateFile(file) || isConfigFile(file)) {
    return [
      {
        file,
        rule: isGateFile(file) ? 'arquivo-do-gate-protegido' : 'config-de-teste-protegida',
        severity: 'hard',
        line: file,
      },
    ];
  }
  if (!isTestFile(file) || !edit.exists) return [];
  const findings: Finding[] = [];
  const added = edit.newString ?? edit.content ?? '';
  for (const line of added.split('\n').filter((l) => DISABLED.test(l)))
    findings.push({ file, rule: 'teste-desligado', severity: 'hard', line: line.trim() });
  if (edit.content !== undefined) {
    findings.push({
      file,
      rule: 'reescrita-integral-de-teste-existente',
      severity: 'hard',
      line: file,
    });
  } else {
    for (const line of (edit.oldString ?? '').split('\n').filter((l) => ASSERTION.test(l)))
      findings.push({
        file,
        rule: 'asserção-removida-ou-alterada',
        severity: 'hard',
        line: line.trim(),
      });
  }
  return findings;
}

const REASON = /^TESTE-ALTERADO:[ \t]*(.{20,})$/m;

/** Motivo de negócio declarado no corpo do PR, ou `null` se ausente/curto. */
export function findReason(prBody: string): string | null {
  return REASON.exec(prBody)?.[1]?.trim() ?? null;
}

export interface Verdict {
  ok: boolean;
  messages: string[];
}

export function judge(findings: Finding[], reason: string | null): Verdict {
  const messages: string[] = [];
  const hard = findings.filter((f) => f.severity === 'hard');
  const soft = findings.filter((f) => f.severity === 'justifiable');
  for (const f of hard) messages.push(`PROIBIDO ${f.rule}: ${f.file}: ${f.line}`);
  for (const f of soft) messages.push(`${reason ? 'JUSTIFICADO' : 'SEM MOTIVO'} ${f.rule}: ${f.file}: ${f.line}`);
  if (soft.length > 0 && !reason)
    messages.push('Declare `TESTE-ALTERADO: <motivo de negócio, 20+ caracteres>` no corpo do PR.');
  return { ok: hard.length === 0 && (soft.length === 0 || reason !== null), messages };
}
