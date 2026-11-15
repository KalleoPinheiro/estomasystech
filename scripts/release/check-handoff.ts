/**
 * `npm run check:handoff` — PR que toca `src/`, `drizzle/`, `Dockerfile`, workflows ou `scripts/release/` precisa
 * de um `.specs/archive/handoff/<issue>-<slug>.md` novo (ADR-102). Editar o `handoff-2026.md` congelado só avisa.
 * Compara com a mesma base do `check:changeset`.
 */
import { detectBase } from '../gate/base';
import { hasHandoffFile, HANDOFF_CONGELADO, requiresHandoff, touchedFrozen } from './handoff-lib';
import { must } from './lib';

const BASE = detectBase(process.env.CHANGESET_BASE || undefined);
const lines = (out: string): string[] => out.split('\n').filter(Boolean);

const changed = lines(must('git', ['diff', '--name-only', `${BASE}...HEAD`]));
const added = lines(must('git', ['diff', '--name-only', '--diff-filter=A', `${BASE}...HEAD`]));

if (touchedFrozen(changed)) {
  console.warn(
    `::warning::${HANDOFF_CONGELADO} está congelado (ADR-102): passe esta entrada para .specs/archive/handoff/<issue>-<slug>.md`,
  );
}
if (requiresHandoff(changed) && !hasHandoffFile(added)) {
  console.error(
    '✗ este PR muda código, pipeline ou release e não traz o handoff da issue.\n' +
      '  Crie .specs/archive/handoff/<issue>-<slug>.md (um arquivo novo por PR; ADR-102).',
  );
  process.exit(1);
}
console.log('✓ handoff ok');
