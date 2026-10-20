/**
 * `npm run release:publish -- --rollback=redeploy|backup` — passo 2 do release (ADR-043). Na
 * `main` com o PR de versão já mergeado, cria a tag anotada `vX.Y.Z`, empurra e cria a GitHub
 * Release com o changelog, as migrações do lote e o rollback que vale para ele (ADR-039).
 * Idempotente: se a tag já existe no remoto, sai sem erro.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  changelogSection,
  isSemver,
  migrationsIn,
  must,
  parseRollback,
  releaseBody,
  sh,
  tagFor,
} from './lib';

const lines = (out: string): string[] => out.split('\n').filter(Boolean);

function assertOnMain(): void {
  if (must('git', ['status', '--porcelain']) !== '') {
    console.error('✗ árvore suja: faça commit ou stash antes.');
    process.exit(1);
  }
  must('git', ['fetch', '-q', '--tags', 'origin', 'main']);
  const onMain =
    must('git', ['rev-parse', '--abbrev-ref', 'HEAD']) === 'main' &&
    must('git', ['rev-parse', 'HEAD']) === must('git', ['rev-parse', 'origin/main']);
  if (!onMain) {
    console.error('✗ rode a partir da `main` igual a `origin/main`.');
    process.exit(1);
  }
}

function migrationsSinceLastTag(): string[] {
  const previous = sh('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*']);
  if (!previous.ok) return migrationsIn(lines(must('git', ['ls-files', 'drizzle'])));
  const diff = must('git', ['diff', '--name-only', `${previous.out}..HEAD`, '--', 'drizzle']);
  return migrationsIn(lines(diff));
}

function argRollback() {
  const arg = process.argv.find((a) => a.startsWith('--rollback='));
  return parseRollback(arg?.slice('--rollback='.length));
}

assertOnMain();
const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
if (!isSemver(version)) {
  console.error(`✗ versão inválida em package.json: ${version}`);
  process.exit(1);
}
const tag = tagFor(version);
if (must('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]) !== '') {
  console.log(`${tag} já está publicada. Nada a fazer.`);
  process.exit(0);
}

const section = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version);
if (section === null) {
  console.error(`✗ CHANGELOG.md não tem a seção ${version}: o PR de versão foi mergeado?`);
  process.exit(1);
}
const migrations = migrationsSinceLastTag();
const rollback = argRollback();
if (rollback === null) {
  console.error('✗ declare o rollback do lote: --rollback=redeploy ou --rollback=backup (ADR-039).');
  process.exit(1);
}

const body = releaseBody({ version, section, migrations, rollback });
must('git', ['tag', '-a', tag, '-m', tag]);
must('git', ['push', 'origin', tag]);
console.log(`✓ tag ${tag} empurrada.`);

const notes = join(tmpdir(), `release-notes-${tag}.md`);
writeFileSync(notes, body);
const created = sh('gh', ['release', 'create', tag, '--title', tag, '--notes-file', notes]);
if (created.ok) {
  console.log(`✓ GitHub Release ${tag} criada. Faça o Deploy dessa tag no Coolify (producao.md § 3.1).`);
} else {
  console.log(
    `\n⚠ não consegui criar a Release com \`gh\` (${created.out.split('\n')[0]}).\n` +
      `  A tag já foi empurrada. Crie a Release ${tag} no GitHub e cole o texto abaixo.\n\n${body}`,
  );
}
