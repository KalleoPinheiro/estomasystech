/**
 * Recibo do gate local (ADR-042): a linha `E2E-GATE:` que `gate:local` imprime e
 * que o CI confere no corpo do PR. O recibo amarra o resultado ao SHA do head: um
 * push novo invalida o anterior.
 */

export interface Receipt {
  sha: string;
  passed: boolean;
  e2eTests: number;
  steps: string[];
  skipped: string[];
  minutes: number;
}

const LINE = /^E2E-GATE:[ \t]+([0-9a-f]{40})[ \t]+(pass|fail)[ \t]+(.*)$/m;

export function formatReceipt(r: Receipt): string {
  const fields = [
    `e2e=${r.e2eTests}`,
    `etapas=${r.steps.join(',')}`,
    `puladas=${r.skipped.length ? r.skipped.join(',') : 'nenhuma'}`,
    `min=${r.minutes.toFixed(1)}`,
  ];
  return `E2E-GATE: ${r.sha} ${r.passed ? 'pass' : 'fail'} ${fields.join(' ')}`;
}

/** Etapas que o recibo precisa listar como executadas para valer. */
export const REQUIRED_STEPS = [
  'typecheck',
  'lint',
  'sv',
  'docs',
  'integridade-de-testes',
  'cobertura',
  'build',
  'e2e-producao',
  'e2e-dev',
] as const;

export interface Check {
  ok: boolean;
  reason: string;
}

export function verifyReceipt(prBody: string, headSha: string): Check {
  const m = LINE.exec(prBody);
  if (!m) return { ok: false, reason: 'Corpo do PR sem a linha `E2E-GATE:` (rode `npm run gate:local`).' };
  const [, sha, status, rest] = m;
  if (sha !== headSha)
    return {
      ok: false,
      reason: `Recibo é do commit ${sha.slice(0, 7)}, mas o head é ${headSha.slice(0, 7)}: rode o gate de novo.`,
    };
  if (status !== 'pass') return { ok: false, reason: 'Recibo registra falha do gate.' };
  const steps = /etapas=(\S+)/.exec(rest)?.[1]?.split(',') ?? [];
  const missing = REQUIRED_STEPS.filter((s) => !steps.includes(s));
  if (missing.length > 0)
    return { ok: false, reason: `Recibo sem as etapas obrigatórias: ${missing.join(', ')}.` };
  return { ok: true, reason: `Recibo válido para ${headSha.slice(0, 7)}.` };
}
