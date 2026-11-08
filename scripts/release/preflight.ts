/**
 * `npm run release:preflight -- --rollback=redeploy|backup [--workflow-ref=<ref> --branch=<release>]` — pré-voo do corte (ADR-088), em ~1 min e sem
 * escrever nada: mesmas pré-condições do `release:cut` (branch, árvore limpa, igual ao origin, `main` dentro,
 * marca `homologacao/vX.Y.Z`, TESTE-ALTERADO consolidado, integridade dos testes, versão que os changesets
 * calculam numa cópia descartável contra o nome da release) mais ambiente (segredo,
 * identidade git, rollback) e permissão de push. O `release-cut.yml` roda isto antes do gate e, com
 * `dry_run`, para aqui.
 */
import { readFileSync } from 'node:fs';
import { consolidatedTesteAlterado } from './cut-lib';
import { assertApproved, assertBranch, batchPrs, checkIntegrity, fail, step } from './cut-pre';
import { parseRollback, sh } from './lib';
import { pendenciaDeVersao, pendenciasDoPreflight } from './preflight-lib';
import { simularVersaoDosChangesets } from './simular-versao';

/** `--workflow-ref=` e `--branch=` (passados pelo workflow); sem nenhum dos dois é corte local (ADR-092). */
function disparoDosArgumentos(): { workflowRef: string; branch: string } | undefined {
  const arg = (nome: string): string | undefined =>
    process.argv.find((a) => a.startsWith(`${nome}=`))?.slice(nome.length + 1);
  const workflowRef = arg('--workflow-ref');
  const branch = arg('--branch');
  return workflowRef === undefined && branch === undefined
    ? undefined
    : { workflowRef: workflowRef ?? '', branch: branch ?? '' };
}

function gitConfig(key: string, envName: string): string {
  return (process.env[envName] ?? '') || sh('git', ['config', '--get', key]).out;
}

step('Pré-voo 1/4 Ambiente');
const repo = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY ?? '';
const falhas = pendenciasDoPreflight({
  token: process.env.GH_TOKEN ?? '',
  repo,
  gitName: gitConfig('user.name', 'GIT_COMMITTER_NAME'),
  gitEmail: gitConfig('user.email', 'GIT_COMMITTER_EMAIL'),
  rollbackOk:
    parseRollback(process.argv.find((a) => a.startsWith('--rollback='))?.slice('--rollback='.length)) !== null,
  emCi: process.env.CI === 'true',
  disparo: disparoDosArgumentos(),
  npm: { pkg: JSON.parse(readFileSync('package.json', 'utf8')), atual: sh('npm', ['--version']).out },
});
if (falhas.length > 0) fail(falhas.join('\n✗ '));

step('Pré-voo 2/4 Pré-condições do corte');
const { branch, version } = assertBranch();
const prepared = assertApproved(version);
checkIntegrity(consolidatedTesteAlterado(batchPrs()));

step('Pré-voo 3/4 Versão dos changesets (simulação em cópia descartável)');
const erroVersao = pendenciaDeVersao(
  branch,
  (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version,
  prepared ? { pendentes: 0, calculada: '' } : simularVersaoDosChangesets(),
  prepared,
);
if (erroVersao !== null) fail(erroVersao);

step('Pré-voo 4/4 Permissão de escrita');
const permissao = sh('gh', ['api', `repos/${repo}`, '--jq', '.permissions.push']);
if (!permissao.ok || permissao.out !== 'true')
  fail(`o token não tem permissão de push em ${repo} (${permissao.out.split('\n')[0] || 'sem resposta'}).`);
const empurra = sh('git', ['push', '--dry-run', '--no-verify', 'origin', `HEAD:refs/heads/${branch}`]);
if (!empurra.ok) fail(`git push --dry-run recusado: ${empurra.out.split('\n')[0]}`);
console.log(`\n✓ pré-voo ok para ${branch} (v${version}). O push real ainda depende do bypass do ruleset release/** para este token.`);
