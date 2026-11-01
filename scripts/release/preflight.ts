/**
 * `npm run release:preflight -- --rollback=redeploy|backup` — pré-voo do corte (ADR-088), em ~1 min e sem
 * escrever nada: mesmas pré-condições do `release:cut` (branch, árvore limpa, igual ao origin, `main` dentro,
 * marca `homologacao/vX.Y.Z`, TESTE-ALTERADO consolidado, integridade dos testes) mais ambiente (segredo,
 * identidade git, rollback) e permissão de push. O `release-cut.yml` roda isto antes do gate e, com
 * `dry_run`, para aqui.
 */
import { consolidatedTesteAlterado } from './cut-lib';
import { assertApproved, assertBranch, batchPrs, checkIntegrity, fail, step } from './cut-pre';
import { parseRollback, sh } from './lib';
import { pendenciasDoPreflight } from './preflight-lib';

function gitConfig(key: string, envName: string): string {
  return (process.env[envName] ?? '') || sh('git', ['config', '--get', key]).out;
}

step('Pré-voo 1/3 Ambiente');
const repo = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY ?? '';
const falhas = pendenciasDoPreflight({
  token: process.env.GH_TOKEN ?? '',
  repo,
  gitName: gitConfig('user.name', 'GIT_COMMITTER_NAME'),
  gitEmail: gitConfig('user.email', 'GIT_COMMITTER_EMAIL'),
  rollbackOk:
    parseRollback(process.argv.find((a) => a.startsWith('--rollback='))?.slice('--rollback='.length)) !== null,
  emCi: process.env.CI === 'true',
});
if (falhas.length > 0) fail(falhas.join('\n✗ '));

step('Pré-voo 2/3 Pré-condições do corte');
const { branch, version } = assertBranch();
assertApproved(version);
checkIntegrity(consolidatedTesteAlterado(batchPrs()));

step('Pré-voo 3/3 Permissão de escrita');
const permissao = sh('gh', ['api', `repos/${repo}`, '--jq', '.permissions.push']);
if (!permissao.ok || permissao.out !== 'true')
  fail(`o token não tem permissão de push em ${repo} (${permissao.out.split('\n')[0] || 'sem resposta'}).`);
const empurra = sh('git', ['push', '--dry-run', 'origin', `HEAD:refs/heads/${branch}`]);
if (!empurra.ok) fail(`git push --dry-run recusado: ${empurra.out.split('\n')[0]}`);
console.log(`\n✓ pré-voo ok para ${branch} (v${version}). O push real ainda depende do bypass do ruleset release/** para este token.`);
