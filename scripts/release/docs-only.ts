/**
 * `tsx scripts/release/docs-only.ts --base origin/main --head <sha>` — imprime `docs_only=true|false`
 * (formato de `$GITHUB_OUTPUT`) conforme o diff da base contra o head toque só `.md` de documentação
 * (ADR-053). O `recibo-gate.yml` dispensa o recibo do gate local quando o resultado é `true`.
 */
import { must, isDocsOnly } from './lib';

function option(name: string): string {
  const i = process.argv.indexOf(name);
  return (i >= 0 ? process.argv[i + 1] : undefined) ?? '';
}

// `--no-renames`: renomear código para `.md` aparece como remoção + adição e não passa por docs.
const touched = must('git', ['diff', '--name-only', '--no-renames', `${option('--base')}...${option('--head') || 'HEAD'}`])
  .split('\n')
  .filter(Boolean);
console.log(`docs_only=${isDocsOnly(touched)}`);
