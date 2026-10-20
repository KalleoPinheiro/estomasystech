/**
 * `npm run check:changeset` — PR que toca `src/`, `drizzle/` ou `Dockerfile` precisa de um
 * `.changeset/*.md` novo (ADR-043). PR só de docs ou CI passa sem. Compara com `origin/main`.
 */
import { hasChangesetFile, must, requiresChangeset } from './lib';

const BASE = process.env.CHANGESET_BASE ?? 'origin/main';

const lines = (out: string): string[] => out.split('\n').filter(Boolean);

const changed = lines(must('git', ['diff', '--name-only', `${BASE}...HEAD`]));
const added = lines(must('git', ['diff', '--name-only', '--diff-filter=A', `${BASE}...HEAD`]));

if (requiresChangeset(changed) && !hasChangesetFile(added)) {
  console.error(
    '✗ este PR muda código que roda em produção e não traz changeset.\n' +
      '  Rode `npm run changeset` (ou `npx changeset --empty` se nada muda para a clínica).',
  );
  process.exit(1);
}
console.log('✓ changeset ok');
