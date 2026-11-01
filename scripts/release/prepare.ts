/**
 * `npm run release:prepare -- --rollback=redeploy|backup` — passo de versão do release
 * (ADR-052, que substitui o do ADR-043). Roda **na `release/vX.Y.Z`** (ou `hotfix/*`) depois da
 * homologação: consome os changesets, sobe a versão, gera o CHANGELOG, confere que a versão
 * calculada bate com o nome da branch, commita, empurra e deixa a GitHub Release em rascunho
 * (changelog, migrações do lote e o rollback declarado). O PR `release → main` vem a seguir.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  changelogSection,
  checkVersionForBranch,
  migrationsSinceLastTag,
  must,
  parseRollback,
  pendingChangesets,
  releaseBody,
  sh,
  tagFor,
} from './lib';
import { conferirNpm, verificarLockfile } from './lockfile-lib';

const lines = (out: string): string[] => out.split('\n').filter(Boolean);
const version = (): string => JSON.parse(readFileSync('package.json', 'utf8')).version as string;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function assertReady(branch: string): void {
  if (must('git', ['status', '--porcelain']) !== '') fail('árvore suja: faça commit ou stash antes.');
  must('git', ['fetch', '-q', 'origin', 'main', branch]);
  if (must('git', ['rev-parse', 'HEAD']) !== must('git', ['rev-parse', `origin/${branch}`])) {
    fail(`${branch} local difere de origin/${branch}: atualize (git pull) ou empurre antes.`);
  }
  if (!sh('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']).ok) {
    fail('a `main` tem commits que a branch não tem: rode `npm run release:sync` (merge, nunca rebase).');
  }
}

const branch = must('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const rollbackArg = process.argv.find((a) => a.startsWith('--rollback='));
const rollback = parseRollback(rollbackArg?.slice('--rollback='.length));
if (rollback === null) fail('declare o rollback do lote: --rollback=redeploy ou --rollback=backup (ADR-039).');

assertReady(branch);
const pending = pendingChangesets(lines(must('git', ['ls-files', '.changeset'])));
if (pending.length === 0) {
  console.log('Nada a publicar: não há changesets pendentes.');
  process.exit(0);
}

const npmErro = conferirNpm(JSON.parse(readFileSync('package.json', 'utf8')), must('npm', ['--version']));
if (npmErro !== null) fail(npmErro);

const before = version();
must('npx', ['changeset', 'version']);
const computed = version();
const check = checkVersionForBranch(branch, before, computed);
if (!check.ok) {
  must('git', ['reset', '--hard', 'HEAD']);
  fail(check.reason);
}

const lockAntes = readFileSync('package-lock.json', 'utf8');
must('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']);
const lockErro = verificarLockfile(lockAntes, readFileSync('package-lock.json', 'utf8'));
if (lockErro !== null) {
  must('git', ['reset', '--hard', 'HEAD']);
  fail(lockErro);
}
const tag = tagFor(computed);
must('git', ['add', '-A']);
must('git', ['commit', '-q', '-m', `chore(release): ${tag}`]);
must('git', ['push', 'origin', branch]);
console.log(`✓ ${branch}: ${tag} commitada com ${pending.length} changeset(s) consumido(s).`);

const section = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), computed);
if (section === null) fail(`CHANGELOG.md não tem a seção ${computed} depois do changeset version.`);
const body = releaseBody({ version: computed, section, migrations: migrationsSinceLastTag(), rollback });
const notes = join(tmpdir(), `release-notes-${tag}.md`);
writeFileSync(notes, body);

const exists = sh('gh', ['release', 'view', tag]).ok;
const draft = exists
  ? sh('gh', ['release', 'edit', tag, '--notes-file', notes])
  : sh('gh', ['release', 'create', tag, '--draft', '--title', tag, '--notes-file', notes, '--target', branch]);
console.log(
  draft.ok
    ? `✓ GitHub Release ${tag} em rascunho.`
    : `⚠ não consegui deixar o rascunho com \`gh\` (${draft.out.split('\n')[0]}). Crie o rascunho ${tag} no GitHub com o texto:\n\n${body}`,
);
console.log(
  `\nPróximo (o \`release:cut\` faz sozinho, ADR-071): gate da release no head, PR "chore(release): ${tag}" contra a main com o recibo no corpo,\n` +
    `the-judge, merge com **merge commit**. Logo depois: \`npm run release:publish -- --rollback=${rollback}\`.`,
);
