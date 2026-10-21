/**
 * `npm run check:testes [-- <base>] [--body-file <arquivo>] [--motivo <texto>]` —
 * regra 8 (ADR-042). Analisa o diff `base...HEAD` (padrão: a release aberta de que a branch saiu, senão `origin/main`; `GATE_BASE` vence, ADR-058) e falha se um
 * teste foi enfraquecido. O motivo de negócio vem do corpo do PR (`--body-file`, no CI),
 * de `--motivo` ou do arquivo local `.gate/motivo-teste.txt` (que o `pre-push` lê).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { detectBase } from './base';
import { analyzeDiff, findReason, judge } from './test-integrity';

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

const diff = execFileSync('git', ['diff', '--no-color', '-U0', `${base}...HEAD`], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const verdict = judge(analyzeDiff(diff), reason);
for (const m of verdict.messages) console.log(m);
if (!verdict.ok) {
  console.error('✗ integridade dos testes (regra 8): teste ou configuração de teste foi enfraquecido.');
  process.exit(1);
}
console.log('✓ integridade dos testes: nenhum teste enfraquecido.');
