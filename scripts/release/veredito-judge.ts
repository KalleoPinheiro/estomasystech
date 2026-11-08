/**
 * `npm run check:veredito -- --autor <id> [--arquivo <texto|json>] [--comentarios <lista.json>] [--sha <sha>] [--revisor-esperado <id>]`
 *
 * Check do veredito estruturado do the-judge (ADR-097). Lê o JSON `the-judge/v1` de um arquivo (o JSON puro ou
 * o texto de um comentário com bloco ```json the-judge```) ou da lista de comentários da PR (vale o último que
 * traz veredito). Sai com 1 se o veredito faltar, for inválido, for de outro SHA, vier do próprio autor ou
 * tiver achado bloqueante. Regras em `veredito-judge-lib.ts`; formato em `docs/engineering/classe-de-risco.md`.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { avaliarVeredito, escolherVeredito, extrairVeredito, formatarAvaliacao } from './veredito-judge-lib';

const opcao = (nome: string): string | undefined => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const autor = opcao('--autor');
if (!autor) {
  console.error('✗ passe --autor <id> (quem escreveu a PR, na mesma forma do campo "autor" do veredito)');
  process.exit(1);
}
const sha = opcao('--sha') ?? spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

const comentarios = opcao('--comentarios');
const arquivo = opcao('--arquivo');
const veredito = comentarios
  ? escolherVeredito(JSON.parse(readFileSync(comentarios, 'utf8')) as string[])
  : arquivo
    ? extrairVeredito(readFileSync(arquivo, 'utf8'))
    : undefined;

const avaliacao = avaliarVeredito(veredito, { sha, autor, revisorEsperado: opcao('--revisor-esperado') });
console.log(formatarAvaliacao(avaliacao));
process.exit(avaliacao.aprovado ? 0 : 1);
