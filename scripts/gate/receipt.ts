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

/**
 * Etapas a mais do PR `release/* → main` (ADR-071): a imagem Docker com smoke e o backup não podem
 * ser puladas. A mutação não é exigida ali: rodou em cada PR do lote e roda inteira na rotina mensal.
 */
export const RELEASE_EXTRA_STEPS = ['docker', 'backup'] as const;

const isReleaseRef = (ref: string): boolean => /^release\/.+$/.test(ref);

/**
 * Arquivos de regra que o Stryker sabe mutar (ADR-047): mesmo escopo de `stryker.config.json`
 * (`src/domain` e `src/application`, sem `.d.ts` nem `index.ts`).
 */
export function mutationTargets(changedFiles: string[]): string[] {
  return changedFiles.filter(
    (f) => /^src\/(domain|application)\/.+\.ts$/.test(f) && !f.endsWith('.d.ts') && !/(^|\/)index\.ts$/.test(f),
  );
}

export interface Check {
  ok: boolean;
  reason: string;
}

export function verifyReceipt(
  prBody: string,
  headSha: string,
  changedFiles: string[] = [],
  headRef = '',
): Check {
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
  const release = isReleaseRef(headRef);
  const required: readonly string[] = release ? [...REQUIRED_STEPS, ...RELEASE_EXTRA_STEPS] : REQUIRED_STEPS;
  const missing = required.filter((s) => !steps.includes(s));
  if (missing.length > 0)
    return { ok: false, reason: `Recibo sem as etapas obrigatórias: ${missing.join(', ')}.` };
  if (!release && mutationTargets(changedFiles).length > 0 && !steps.includes('mutacao'))
    return {
      ok: false,
      reason: 'O diff muda regra em domain/application: o recibo precisa da etapa `mutacao` (ADR-047).',
    };
  return { ok: true, reason: `Recibo válido para ${headSha.slice(0, 7)}.` };
}
