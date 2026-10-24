/**
 * `npm run gate:local` — o gate que substitui o E2E do Actions (ADR-042). Roda, em
 * ordem e parando na primeira falha, tudo que o CI rodava mais a integridade dos
 * testes, e imprime a linha `E2E-GATE:` que vai no corpo do PR. A árvore precisa
 * estar limpa: o recibo vale para o SHA do HEAD, não para arquivos soltos.
 *
 * Se o diff muda regra em `src/domain` ou `src/application`, roda também a mutação (Stryker) só
 * nesses arquivos e falha abaixo de `thresholds.break` (ADR-047).
 *
 * Docker é opcional só quando o daemon não existe (ex.: thread na nuvem); a etapa
 * pulada fica registrada no recibo e o CI roda o job Docker quando o que ele valida muda.
 *
 * Perfil `release` (ADR-071, `release/*` ou `GATE_PERFIL=release`): sem mutação e com Docker
 * obrigatório. O ambiente (fuso, porta, memória, segredos, sobras) é fixado em `ambiente.ts` (#571).
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dockerEnv, disposableSecrets, type Env, gateEnv, gatePostgresPort, LEFTOVERS } from './ambiente';
import { detectBase } from './base';
import { planFor, profileFor, type Step } from './plano';
import { formatReceipt, mutationTargets } from './receipt';

const STEPS: Step[] = [
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

const DOCKER_STEPS: Step[] = [
  { name: 'docker', cmd: 'bash', args: ['scripts/gate/docker-step.sh'], docker: true },
  { name: 'backup', cmd: 'bash', args: ['scripts/backup-smoke.sh'], docker: true },
];

function git(...args: string[]): string {
  return spawnSync('git', args, { encoding: 'utf8' }).stdout.trim();
}

/** Arquivos alterados contra a base (`GATE_BASE`, senão a release aberta, senão `origin/main`: ADR-058) que a mutação cobre. */
function changedRuleFiles(): string[] {
  const out = git('diff', '--name-only', '--diff-filter=d', `${detectBase()}...HEAD`);
  return mutationTargets(out.split('\n').filter(Boolean));
}

function dockerAvailable(): boolean {
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

function run(step: Step, env: Env): Promise<{ ok: boolean; passed: number }> {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(step.cmd, step.args, { env: env as NodeJS.ProcessEnv });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk: Buffer) => {
        process.stdout.write(chunk);
        out = (out + chunk.toString()).slice(-20_000);
      });
    }
    child.on('close', (code) => {
      const m = /(\d+) passed/.exec(out);
      resolve({ ok: code === 0, passed: m ? Number(m[1]) : 0 });
    });
  });
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

interface Outcome {
  passed: boolean;
  done: string[];
  e2eTests: number;
}

async function runAll(steps: Step[], env: Env): Promise<Outcome> {
  const docker = dockerEnv(env, disposableSecrets());
  const outcome: Outcome = { passed: true, done: [], e2eTests: 0 };
  for (const step of steps) {
    console.log(`\n▶ ${step.name}`);
    const r = await run(step, step.docker ? docker : env);
    if (!r.ok) {
      console.error(`✗ falhou em ${step.name}`);
      outcome.passed = false;
      break;
    }
    outcome.done.push(step.name);
    if (step.countsE2e) outcome.e2eTests += r.passed;
  }
  return outcome;
}

async function main(): Promise<void> {
  if (git('status', '--porcelain') !== '') fail('árvore suja: faça commit antes. O recibo vale para o SHA do HEAD.');
  for (const dir of LEFTOVERS) rmSync(dir, { recursive: true, force: true });
  const profile = profileFor(git('rev-parse', '--abbrev-ref', 'HEAD'), process.env.GATE_PERFIL);
  const plan = planFor({
    profile,
    steps: STEPS,
    dockerSteps: DOCKER_STEPS,
    hasDocker: dockerAvailable(),
    rules: profile === 'release' ? [] : changedRuleFiles(),
  });
  if (!plan.ok) fail(plan.reason);
  const env = gateEnv(process.env, await gatePostgresPort(process.env));
  console.log(`Perfil: ${profile} · base do diff: ${detectBase()} · TZ=UTC · POSTGRES_PORT=${env.POSTGRES_PORT}`);
  const sha = git('rev-parse', 'HEAD');
  const started = Date.now();
  const outcome = await runAll(plan.steps, env);

  const line = formatReceipt({
    sha,
    passed: outcome.passed,
    e2eTests: outcome.e2eTests,
    steps: outcome.done,
    skipped: plan.skipped,
    minutes: (Date.now() - started) / 60_000,
  });
  mkdirSync('.gate', { recursive: true });
  writeFileSync('.gate/recibo.txt', `${line}\n`);
  console.log(`\nCole no corpo do PR:\n${line}`);
  process.exit(outcome.passed ? 0 : 1);
}

void main();
