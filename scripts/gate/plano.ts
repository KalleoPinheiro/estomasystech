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

export const STEPS: Step[] = [
  { name: 'typecheck', cmd: 'npm', args: ['run', 'typecheck'] },
  { name: 'lint', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'sv', cmd: 'npm', args: ['run', 'check:sv'] },
  { name: 'docs', cmd: 'npm', args: ['run', 'check:docs'] },
  { name: 'integridade-de-testes', cmd: 'npm', args: ['run', 'check:testes'] },
  { name: 'cobertura', cmd: 'npm', args: ['run', 'test:coverage'] },
  { name: 'build', cmd: 'npm', args: ['run', 'build'] },
  { name: 'e2e-producao', cmd: 'npm', args: ['run', 'test:e2e:prod'], countsE2e: true },
  { name: 'e2e-dev', cmd: 'npm', args: ['run', 'test:e2e:dev'], countsE2e: true },
];

export const DOCKER_STEPS: Step[] = [
  { name: 'docker', cmd: 'bash', args: ['scripts/gate/docker-step.sh'], docker: true },
  { name: 'backup', cmd: 'bash', args: ['scripts/backup-smoke.sh'], docker: true },
];

const RELEASE_BRANCH = /^release\/.+$/;

/** Perfil do gate: `GATE_PERFIL` vence; senão `release/*` é release e o resto é PR. */
export function profileFor(branch: string, explicit?: string): Profile {
  if (explicit === 'release' || explicit === 'pr') return explicit;
  return RELEASE_BRANCH.test(branch) ? 'release' : 'pr';
}

export interface PlanInput {
  profile: Profile;
  hasDocker: boolean;
  /** Arquivos de regra alterados (`mutationTargets`). */
  rules: string[];
}

export type Plan = { ok: true; steps: Step[]; skipped: string[] } | { ok: false; reason: string };

export function planFor({ profile, hasDocker, rules }: PlanInput): Plan {
  if (profile === 'release') {
    if (!hasDocker)
      return {
        ok: false,
        reason: 'o gate da release exige Docker (imagem + smoke + backup): rode no WSL com o daemon no ar.',
      };
    return { ok: true, steps: [...STEPS, ...DOCKER_STEPS], skipped: [] };
  }
  const mutation: Step[] = rules.length
    ? [{ name: 'mutacao', cmd: 'npm', args: ['run', 'test:mutacao', '--', '--mutate', rules.join(',')] }]
    : [];
  return {
    ok: true,
    steps: [...STEPS, ...mutation, ...(hasDocker ? DOCKER_STEPS : [])],
    skipped: hasDocker ? [] : DOCKER_STEPS.map((s) => s.name),
  };
}
