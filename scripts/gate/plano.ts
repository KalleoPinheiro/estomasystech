/**
 * Etapas do `gate:local` por perfil (ADR-071, que substitui o ponto do ADR-051 sobre a release).
 *
 * - `pr` (feature, hotfix): o gate de sempre, com a mutação só nos arquivos de regra alterados
 *   (ADR-051); Docker e backup são pulados, e registrados no recibo, quando não há daemon.
 * - `release` (`release/*` ou `GATE_PERFIL=release`, que o `release:cut` passa): sem mutação, que
 *   já rodou em cada PR do lote e roda inteira na rotina mensal; Docker e backup são obrigatórios.
 */

export type Profile = 'pr' | 'release';

export interface Step {
  name: string;
  cmd: string;
  args: string[];
  /** Soma ao total de testes E2E o "N passed" do Playwright. */
  countsE2e?: boolean;
  /** Roda com segredos descartáveis e o fuso do compose (`dockerEnv`). */
  docker?: boolean;
}

const RELEASE_BRANCH = /^release\/.+$/;

/** Perfil do gate: `GATE_PERFIL` vence; senão `release/*` é release e o resto é PR. */
export function profileFor(branch: string, explicit?: string): Profile {
  if (explicit === 'release' || explicit === 'pr') return explicit;
  return RELEASE_BRANCH.test(branch) ? 'release' : 'pr';
}

export interface PlanInput {
  profile: Profile;
  /** Etapas de sempre, na ordem (`STEPS` de `local.ts`). */
  steps: Step[];
  /** Etapas Docker (`docker`, `backup`). */
  dockerSteps: Step[];
  hasDocker: boolean;
  /** Arquivos de regra alterados (`mutationTargets`). */
  rules: string[];
}

export type Plan = { ok: true; steps: Step[]; skipped: string[] } | { ok: false; reason: string };

export function planFor({ profile, steps, dockerSteps, hasDocker, rules }: PlanInput): Plan {
  if (profile === 'release') {
    if (!hasDocker)
      return {
        ok: false,
        reason: 'o gate da release exige Docker (imagem + smoke + backup): rode no WSL com o daemon no ar.',
      };
    return { ok: true, steps: [...steps, ...dockerSteps], skipped: [] };
  }
  const mutation: Step[] = rules.length
    ? [{ name: 'mutacao', cmd: 'npm', args: ['run', 'test:mutacao', '--', '--mutate', rules.join(',')] }]
    : [];
  return {
    ok: true,
    steps: [...steps, ...mutation, ...(hasDocker ? dockerSteps : [])],
    skipped: hasDocker ? [] : dockerSteps.map((s) => s.name),
  };
}
