/**
 * `npm run check:testes [base]` — regra 8 (ADR-042). Analisa o diff `base...HEAD`
 * (padrão `origin/main`) e falha se um teste foi enfraquecido. O motivo de negócio
 * vem de `PR_BODY` (CI) ou `TESTE_ALTERADO_MOTIVO` (local).
 */
import { execFileSync } from 'node:child_process';
import { analyzeDiff, findReason, judge } from './test-integrity';

const base = process.argv[2] ?? 'origin/main';
const diff = execFileSync('git', ['diff', '--no-color', '-U0', `${base}...HEAD`], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const reason = findReason(process.env.PR_BODY ?? '') ?? findReason(`TESTE-ALTERADO: ${process.env.TESTE_ALTERADO_MOTIVO ?? ''}`);
const verdict = judge(analyzeDiff(diff), reason);
for (const m of verdict.messages) console.log(m);
if (!verdict.ok) {
  console.error('✗ integridade dos testes (regra 8): teste ou configuração de teste foi enfraquecido.');
  process.exit(1);
}
console.log('✓ integridade dos testes: nenhum teste enfraquecido.');
