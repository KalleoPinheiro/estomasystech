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
const CONFIG_FILE = /^(vitest\.config\.mts|playwright\.config\.ts|playwright\.prod\.config\.ts)$/;
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

/** Analisa um diff unificado (`git diff <base>...HEAD`) e devolve os achados. */
export function analyzeDiff(diff: string): Finding[] {
  const findings: Finding[] = [];
  for (const h of parseDiff(diff)) {
    if (isConfigFile(h.file)) {
      findings.push(...configFindings(h));
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
