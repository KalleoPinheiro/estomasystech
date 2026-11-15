/**
 * `npm run release:prepare -- --rollback=redeploy|backup` — passo de versão (ADR-109, que simplifica o ADR-052).
 * Roda numa branch curta criada a partir da `main` (ex.: `chore/release-0.8.0`): consome os changesets, sobe a
 * versão, gera o CHANGELOG, confere o lockfile, commita e empurra. O PR `chore(release): vX.Y.Z` contra a `main`
 * entra como qualquer outro (CI verde, auto-merge); depois o workflow "Release deploy" tagueia a `main`.
 */
import { readFileSync } from 'node:fs';
import { must, parseRollback, pendingChangesets, tagFor } from './lib';
import { conferirNpm, verificarLockfile } from './lockfile-lib';

const lines = (out: string): string[] => out.split('\n').filter(Boolean);
const version = (): string => JSON.parse(readFileSync('package.json', 'utf8')).version as string;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const branch = must('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch === 'main') fail('crie uma branch curta a partir da main (ex.: chore/release-X.Y.Z) e rode de lá.');
if (must('git', ['status', '--porcelain']) !== '') fail('árvore suja: faça commit ou stash antes.');
const rollbackArg = process.argv.find((a) => a.startsWith('--rollback='));
const rollback = parseRollback(rollbackArg?.slice('--rollback='.length));
if (rollback === null) fail('declare o rollback do lote: --rollback=redeploy ou --rollback=backup (ADR-039).');

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
if (computed === before) {
  must('git', ['reset', '--hard', 'HEAD']);
  fail('a versão não mudou: confira os changesets pendentes.');
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
must('git', ['push', '-u', 'origin', branch]);
console.log(`✓ ${branch}: ${tag} commitada com ${pending.length} changeset(s) consumido(s).`);
console.log(
  `\nPróximo: PR "chore(release): ${tag}" contra a main (CI verde, auto-merge). Depois do merge: backup no VPS, ` +
    `workflow "Release deploy" (rollback=${rollback}) e deploy da tag no Coolify (producao.md § 3.1).`,
);
