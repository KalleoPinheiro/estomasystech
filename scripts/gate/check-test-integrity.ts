/**
 * `npm run check:testes [-- <base>] [--body-file <arquivo>] [--motivo <texto>] [--motivo-gate <texto>]` —
 * regra 8 (ADR-042). Analisa o diff `base...HEAD` (padrão: a release aberta de que a branch saiu, senão `origin/main`; `GATE_BASE` vence, ADR-058) e falha se um
 * teste foi enfraquecido. O motivo de negócio vem do corpo do PR (`--body-file`, no CI),
 * de `--motivo` ou do arquivo local `.gate/motivo-teste.txt` (que o `pre-push` lê).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { detectBase } from './base';
import { analyzeConfigs, type ConfigPair, isGatedConfig } from './gate-config';
import { analyzeDiff, findGateReason, findReason, judge } from './test-integrity';

function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const base = detectBase(process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--')));
const bodyFile = option('--body-file');
const motivoFile = '.gate/motivo-teste.txt';
const sources = [
  bodyFile ? readFileSync(bodyFile, 'utf8') : '',
  `TESTE-ALTERADO: ${option('--motivo') ?? ''}`,
  existsSync(motivoFile) ? `TESTE-ALTERADO: ${readFileSync(motivoFile, 'utf8').trim()}` : '',
];
const reason = sources.map(findReason).find((r) => r !== null) ?? null;
const gateFile = '.gate/motivo-gate.txt';
const gateSources = [
  bodyFile ? readFileSync(bodyFile, 'utf8') : '',
  `GATE-ALTERADO: ${option('--motivo-gate') ?? ''}`,
  existsSync(gateFile) ? `GATE-ALTERADO: ${readFileSync(gateFile, 'utf8').trim()}` : '',
];
const gateReason = gateSources.map(findGateReason).find((r) => r !== null) ?? null;

function show(ref: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** Configs protegidas que existem na base: o que o HEAD apagou, renomeou ou afrouxou aparece aqui. */
function configPairs(): ConfigPair[] {
  const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', base], { encoding: 'utf8' });
  return tracked
    .split('\n')
    .filter(isGatedConfig)
    .map((file) => ({ file, base: show(base, file), head: show('HEAD', file) }));
}

const diff = execFileSync('git', ['diff', '--no-color', '-U0', `${base}...HEAD`], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const verdict = judge([...analyzeDiff(diff), ...analyzeConfigs(configPairs())], reason, gateReason);
for (const m of verdict.messages) console.log(m);
if (!verdict.ok) {
  console.error('✗ integridade dos testes (regra 8): teste ou configuração de teste foi enfraquecido.');
  process.exit(1);
}
console.log('✓ integridade dos testes: nenhum teste enfraquecido.');
