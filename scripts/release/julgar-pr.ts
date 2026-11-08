/**
 * `tsx scripts/release/julgar-pr.ts --diff <arquivo> --saida <veredito.json>` | `--diff <arquivo> --classificar` (ADR-100)
 *
 * Roda só no job `Veredito do the-judge` do Actions. Lê o diff da PR, pede o julgamento ao modelo com a
 * credencial do repositório e grava o veredito `the-judge/v1` com `sha`, `autor` e `revisor` do contexto do job.
 * Variáveis: ANTHROPIC_API_KEY, JUDGE_MODEL (padrão claude-sonnet-5-5), PR_SHA, PR_AUTOR, PR_TITULO, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT.
 * Sempre grava um veredito (de falha, se for o caso) e sai com 0; quem reprova é o `check:veredito`.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { arquivosDoDiff, chamarAnthropic, identidadeDoJob, julgar, tocaCaminhoProtegido } from './julgar-pr-lib';

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
if (arquivoDiff && process.argv.includes('--classificar')) {
  const protegido = tocaCaminhoProtegido(arquivosDoDiff(readFileSync(arquivoDiff, 'utf8')));
  console.log(`protegido=${protegido}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `protegido=${protegido}\n`);
  process.exit(0);
}
if (!arquivoDiff || !saida) {
  console.error('✗ passe --diff <arquivo> e --saida <veredito.json>');
  process.exit(1);
}

const veredito = await julgar(
  readFileSync(arquivoDiff, 'utf8'),
  process.env.PR_TITULO ?? '',
  {
    sha: exigir('PR_SHA'),
    autor: exigir('PR_AUTOR'),
    revisor: identidadeDoJob(exigir('GITHUB_RUN_ID'), process.env.GITHUB_RUN_ATTEMPT ?? '1'),
  },
  chamarAnthropic({ chave: exigir('ANTHROPIC_API_KEY'), modelo: process.env.JUDGE_MODEL ?? 'claude-sonnet-5-5' }),
);
writeFileSync(saida, `${JSON.stringify(veredito, null, 2)}\n`);
console.log(`veredito gravado em ${saida}: ${veredito.achados.length} achado(s)`);
