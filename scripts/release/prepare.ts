/**
 * `npm run release:prepare` — passo 1 do release (ADR-043). Espelha o PR "Version Packages" do
 * `changesets/action`: a partir da `main` atualizada, consome os changesets, sobe a versão,
 * gera o CHANGELOG e empurra a branch `release/vX.Y.Z`. O PR é aberto e mergeado como qualquer
 * outro; depois vem `release:publish`.
 */
import { readFileSync } from 'node:fs';
import { must, pendingChangesets, sh, tagFor } from './lib';

const lines = (out: string): string[] => out.split('\n').filter(Boolean);

function assertReady(): void {
  if (must('git', ['status', '--porcelain']) !== '') {
    console.error('✗ árvore suja: faça commit ou stash antes.');
    process.exit(1);
  }
  must('git', ['fetch', '-q', 'origin', 'main']);
  const head = must('git', ['rev-parse', 'HEAD']);
  const main = must('git', ['rev-parse', 'origin/main']);
  const branch = must('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main' || head !== main) {
    console.error('✗ rode a partir da `main` igual a `origin/main`.');
    process.exit(1);
  }
}

function currentVersion(): string {
  return JSON.parse(readFileSync('package.json', 'utf8')).version as string;
}

assertReady();
const pending = pendingChangesets(lines(must('git', ['ls-files', '.changeset'])));
if (pending.length === 0) {
  console.log('Nada a publicar: não há changesets pendentes.');
  process.exit(0);
}

must('git', ['switch', '-c', 'release/next']);
must('npx', ['changeset', 'version']);
const version = currentVersion();
must('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']);
const branch = `release/${tagFor(version)}`;
must('git', ['branch', '-m', branch]);
must('git', ['add', '-A']);
must('git', ['commit', '-q', '-m', `chore(release): ${tagFor(version)}`]);
must('git', ['push', '-u', 'origin', branch]);

const gh = sh('gh', ['--version']).ok;
console.log(
  `✓ ${branch} empurrada com ${pending.length} changeset(s) consumido(s).\n` +
    `  Abra o PR "chore(release): ${tagFor(version)}" contra a main${gh ? ' (gh pr create)' : ''}, ` +
    'rode `npm run gate:local` e cole o recibo no corpo. Depois do merge: `npm run release:publish`.',
);
