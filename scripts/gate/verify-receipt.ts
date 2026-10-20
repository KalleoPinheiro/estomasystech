/**
 * Confere o recibo do gate local no corpo do PR (job `recibo-gate` do CI).
 * Uso: `tsx scripts/gate/verify-receipt.ts --body-file <arquivo> --head-sha <sha>`.
 * Sai 1 se o recibo falta, é de outro commit ou não lista as etapas obrigatórias.
 */
import { readFileSync } from 'node:fs';
import { verifyReceipt } from './receipt';

function option(name: string): string {
  const i = process.argv.indexOf(name);
  return (i >= 0 ? process.argv[i + 1] : undefined) ?? '';
}

const body = option('--body-file') ? readFileSync(option('--body-file'), 'utf8') : '';
const check = verifyReceipt(body, option('--head-sha'));
console.log(check.ok ? `✓ ${check.reason}` : `✗ ${check.reason}`);
process.exit(check.ok ? 0 : 1);
