/**
 * `tsx scripts/release/check-homologacao.ts --body-file <arquivo> [--base origin/release/vX.Y.Z]`
 * — PR `feat/* → release/*` que muda produção traz `Seed:` e cenários de homologação Dado/Quando/Então
 * (ADR-052). Roda no `recibo-gate.yml` quando a base é uma release.
 */
import { readFileSync } from 'node:fs';
import { checkHomologacao, must } from './lib';

function option(name: string): string {
  const i = process.argv.indexOf(name);
  return (i >= 0 ? process.argv[i + 1] : undefined) ?? '';
}

const body = option('--body-file') ? readFileSync(option('--body-file'), 'utf8') : '';
const base = option('--base') || 'origin/main';
const changed = must('git', ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`]).split('\n').filter(Boolean);
const check = checkHomologacao(body, changed);
console.log(check.ok ? '✓ homologação ok' : `✗ ${check.reason}`);
process.exit(check.ok ? 0 : 1);
