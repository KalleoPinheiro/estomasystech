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
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { detectBase } from './base';
import { formatReceipt, mutationTargets } from './receipt';

interface Step {
  name: string;
  cmd: string;
  args: string[];
  /** Soma ao total de testes E2E o "N passed" do Playwright. */
  countsE2e?: boolean;
}

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
  { name: 'docker', cmd: 'bash', args: ['-c', 'docker compose build && bash scripts/docker-smoke.sh'] },
  { name: 'backup', cmd: 'bash', args: ['scripts/backup-smoke.sh'] },
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

function run(step: Step): Promise<{ ok: boolean; passed: number }> {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(step.cmd, step.args, { env: { ...process.env, CI: '1' } });
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

async function main(): Promise<void> {
  if (git('status', '--porcelain') !== '') {
    console.error('✗ árvore suja: faça commit antes. O recibo vale para o SHA do HEAD.');
    process.exit(1);
  }
  console.log(`Base do diff: ${detectBase()}`);
  const sha = git('rev-parse', 'HEAD');
  const started = Date.now();
  const done: string[] = [];
  const skipped: string[] = [];
  let e2eTests = 0;
  let passed = true;

  const hasDocker = dockerAvailable();
  const rules = changedRuleFiles();
  const mutation: Step[] = rules.length
    ? [{ name: 'mutacao', cmd: 'npm', args: ['run', 'test:mutacao', '--', '--mutate', rules.join(',')] }]
    : [];
  const plan = [...STEPS, ...mutation, ...(hasDocker ? DOCKER_STEPS : [])];
  if (!hasDocker) skipped.push('docker', 'backup');

  for (const step of plan) {
    console.log(`\n▶ ${step.name}`);
    const r = await run(step);
    if (!r.ok) {
      console.error(`✗ falhou em ${step.name}`);
      passed = false;
      break;
    }
    done.push(step.name);
    if (step.countsE2e) e2eTests += r.passed;
  }

  const line = formatReceipt({
    sha,
    passed,
    e2eTests,
    steps: done,
    skipped,
    minutes: (Date.now() - started) / 60_000,
  });
  mkdirSync('.gate', { recursive: true });
  writeFileSync('.gate/recibo.txt', `${line}\n`);
  console.log(`\nCole no corpo do PR:\n${line}`);
  process.exit(passed ? 0 : 1);
}

void main();
