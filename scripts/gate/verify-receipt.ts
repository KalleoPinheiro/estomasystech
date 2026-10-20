/**
 * Confere o recibo do gate local no corpo do PR (job `recibo-gate` do CI).
 * Entradas: `PR_BODY` e `HEAD_SHA`. Sai 1 se o recibo falta, é de outro commit ou
 * não lista as etapas obrigatórias.
 */
import { verifyReceipt } from './receipt';

const check = verifyReceipt(process.env.PR_BODY ?? '', process.env.HEAD_SHA ?? '');
console.log(check.ok ? `✓ ${check.reason}` : `✗ ${check.reason}`);
process.exit(check.ok ? 0 : 1);
