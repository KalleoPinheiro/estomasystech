/**
 * Confere o recibo do gate local no corpo do PR (job `recibo-gate` do CI).
 * Uso: `tsx scripts/gate/verify-receipt.ts --body-file <arquivo> --head-sha <sha> [--base-ref origin/main]`.
 * Sai 1 se o recibo falta, é de outro commit ou não lista as etapas obrigatórias
 * (com `--base-ref`, exige também `mutacao` quando o diff muda regra em domain/application).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { verifyReceipt } from './receipt';

function option(name: string): string {
  const i = process.argv.indexOf(name);
  return (i >= 0 ? process.argv[i + 1] : undefined) ?? '';
}

const body = option('--body-file') ? readFileSync(option('--body-file'), 'utf8') : '';
const baseRef = option('--base-ref');
const changed = baseRef
  ? spawnSync('git', ['diff', '--name-only', '--diff-filter=d', `${baseRef}...${option('--head-sha')}`], {
      encoding: 'utf8',
    }).stdout.split('\n').filter(Boolean)
  : [];
const check = verifyReceipt(body, option('--head-sha'), changed);
console.log(check.ok ? `✓ ${check.reason}` : `✗ ${check.reason}`);
process.exit(check.ok ? 0 : 1);
