/**
 * `npm run release:publish -- --rollback=redeploy|backup` — passo de publicação (ADR-052, que
 * substitui o do ADR-043). Na `main` já com o PR da release mergeado (merge commit), cria a tag
 * anotada `vX.Y.Z` **no commit que a main recebeu**, empurra e publica a GitHub Release: o rascunho
 * do `release:prepare`, ou uma nova se não houver. Idempotente: tag já no remoto, sai sem erro.
 * `--hotfix` aceita um HEAD que não é merge commit (PR de `hotfix/*`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  changelogSection,
  isSemver,
  migrationsSinceLastTag,
  must,
  parseRollback,
  releaseBody,
  sh,
  tagFor,
} from './lib';

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function assertOnMain(hotfix: boolean): void {
  if (must('git', ['status', '--porcelain']) !== '') fail('árvore suja: faça commit ou stash antes.');
  must('git', ['fetch', '-q', '--tags', 'origin', 'main']);
  const onMain =
    must('git', ['rev-parse', '--abbrev-ref', 'HEAD']) === 'main' &&
    must('git', ['rev-parse', 'HEAD']) === must('git', ['rev-parse', 'origin/main']);
  if (!onMain) fail('rode a partir da `main` igual a `origin/main`.');
  const parents = must('git', ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ').length - 1;
  if (parents < 2 && !hotfix) {
    fail(
      'o HEAD da main não é um merge commit: a release entrou por squash ou rebase e a tag ficaria fora ' +
        'do histórico da release (ADR-052). Em PR de `hotfix/*`, use --hotfix.',
    );
  }
}

const hotfix = process.argv.includes('--hotfix');
assertOnMain(hotfix);
const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
if (!isSemver(version)) fail(`versão inválida em package.json: ${version}`);
const tag = tagFor(version);
if (must('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]) !== '') {
  console.log(`${tag} já está publicada. Nada a fazer.`);
  process.exit(0);
}

const section = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version);
if (section === null) fail(`CHANGELOG.md não tem a seção ${version}: o \`release:prepare\` foi mergeado?`);
const rollbackArg = process.argv.find((a) => a.startsWith('--rollback='));
const rollback = parseRollback(rollbackArg?.slice('--rollback='.length));
if (rollback === null) fail('declare o rollback do lote: --rollback=redeploy ou --rollback=backup (ADR-039).');

const body = releaseBody({ version, section, migrations: migrationsSinceLastTag(), rollback });
must('git', ['tag', '-a', tag, '-m', tag]);
must('git', ['push', 'origin', tag]);
console.log(`✓ tag ${tag} empurrada no commit ${must('git', ['rev-parse', '--short', 'HEAD'])} da main.`);

const notes = join(tmpdir(), `release-notes-${tag}.md`);
writeFileSync(notes, body);
const isDraft = sh('gh', ['release', 'view', tag, '--json', 'isDraft', '--jq', '.isDraft']).out === 'true';
const published = isDraft
  ? sh('gh', ['release', 'edit', tag, '--draft=false', '--notes-file', notes, '--verify-tag'])
  : sh('gh', ['release', 'create', tag, '--title', tag, '--notes-file', notes]);
if (published.ok) {
  console.log(`✓ GitHub Release ${tag} publicada. Faça o Deploy dessa tag no Coolify (producao.md § 3.1).`);
} else {
  console.log(
    `\n⚠ não consegui publicar a Release com \`gh\` (${published.out.split('\n')[0]}).\n` +
      `  A tag já foi empurrada. Publique a Release ${tag} no GitHub com o texto abaixo.\n\n${body}`,
  );
}
