/**
 * `tsx scripts/release/julgar-pr.ts --diff <arquivo> --saida <veredito.json>` | `--arquivos <lista NUL> --classificar` (ADR-100)
 *
 * Roda só no job `Veredito do the-judge` do Actions. Lê o diff da PR, pede o julgamento ao modelo com a
 * credencial do repositório e grava o veredito `the-judge/v1` com `sha`, `autor` e `revisor` do contexto do job.
 * Autentica por federação de identidades (OIDC do job → token curto da Anthropic), sem chave de API.
 * Variáveis: ANTHROPIC_FEDERATION_RULE_ID, ANTHROPIC_ORGANIZATION_ID, ANTHROPIC_SERVICE_ACCOUNT_ID, ANTHROPIC_WORKSPACE_ID (opcional),
 * ACTIONS_ID_TOKEN_REQUEST_URL/TOKEN (do runner), JUDGE_MODEL (padrão claude-sonnet-5-5), PR_SHA, PR_AUTOR, PR_TITULO, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT.
 * Veredito de falha (API fora do ar, resposta ilegível, diff grande) sai com 1 e não grava o arquivo que o cache lê.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import {
  arquivosDeNul,
  chamarComFederacao,
  ehVereditoDeFalha,
  identidadeDoJob,
  julgar,
  tocaCaminhoProtegido,
} from './julgar-pr-lib';

const opcao = (nome: string): string | undefined => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const exigir = (nome: string): string => {
  const v = process.env[nome];
  if (!v) {
    console.error(`✗ variável ${nome} ausente`);
    process.exit(1);
  }
  return v;
};

const arquivoDiff = opcao('--diff');
const saida = opcao('--saida');

// `--classificar`: só diz se o diff toca caminho protegido (a classe 3 humana vira exigência), sem chamar o modelo.
const arquivosNul = opcao('--arquivos');
if (arquivosNul && process.argv.includes('--classificar')) {
  const protegido = tocaCaminhoProtegido(arquivosDeNul(readFileSync(arquivosNul, 'utf8')));
  console.log(`protegido=${protegido}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `protegido=${protegido}\n`);
  process.exit(0);
}
if (!arquivoDiff || !saida) {
  console.error('✗ passe --diff <arquivo> e --saida <veredito.json>');
  process.exit(1);
}

// Sem `await` no topo: o `tsx` roda este arquivo como CJS (o pacote não é `type: module`) e rejeita top-level await.
async function julgarEGravar(diff: string, destino: string): Promise<void> {
  const veredito = await julgar(
    readFileSync(diff, 'utf8'),
    process.env.PR_TITULO ?? '',
    {
      sha: exigir('PR_SHA'),
      autor: exigir('PR_AUTOR'),
      revisor: identidadeDoJob(exigir('GITHUB_RUN_ID'), process.env.GITHUB_RUN_ATTEMPT ?? '1'),
    },
    chamarComFederacao({
      urlOidc: exigir('ACTIONS_ID_TOKEN_REQUEST_URL'),
      tokenDeRequisicao: exigir('ACTIONS_ID_TOKEN_REQUEST_TOKEN'),
      cfg: {
        regra: exigir('ANTHROPIC_FEDERATION_RULE_ID'),
        organizacao: exigir('ANTHROPIC_ORGANIZATION_ID'),
        contaDeServico: exigir('ANTHROPIC_SERVICE_ACCOUNT_ID'),
        workspace: process.env.ANTHROPIC_WORKSPACE_ID || undefined,
      },
      modelo: process.env.JUDGE_MODEL || 'claude-sonnet-5-5',
    }),
  );
  // Falha não é julgamento: nada é gravado onde o cache por SHA lê, e o job reprova sem fixar o SHA.
  if (ehVereditoDeFalha(veredito)) {
    writeFileSync(`${destino}.falha`, `${JSON.stringify(veredito, null, 2)}\n`);
    console.error(`✗ ${veredito.achados[0].detalhe ?? 'falha ao julgar'} (nada gravado para o SHA; um re-run julga de novo)`);
    process.exit(1);
  }
  writeFileSync(destino, `${JSON.stringify(veredito, null, 2)}\n`);
  console.log(`veredito gravado em ${destino}: ${veredito.achados.length} achado(s)`);
}

julgarEGravar(arquivoDiff, saida).catch((e: unknown) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
