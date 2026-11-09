import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wf = readFileSync('.github/workflows/veredito-judge.yml', 'utf8');
/** Corpo de um job de primeiro nível: do `  nome:` até o próximo job ou o fim. */
const job = (nome: string): string => {
  const ini = wf.indexOf(`\n  ${nome}:\n`);
  expect(ini, `job ${nome}`).toBeGreaterThan(-1);
  const resto = wf.slice(ini + 1);
  const prox = resto.slice(1).search(/\n {2}[a-z-]+:\n/);
  return prox < 0 ? resto : resto.slice(0, prox + 1);
};
const semComentario = (t: string): string => t.replace(/^\s*#.*$/gm, '');

describe('workflow do veredito · segredo e fork', () => {
  it('Dado PR de fork, Quando o workflow dispara, Então o job com segredo não roda e o check reprova', () => {
    expect(job('julgar')).toMatch(
      /if:.*head\.repo\.full_name == github\.repository/,
    );
    expect(job('veredito')).toContain('FORK');
    expect(job('veredito')).toMatch(/FORK" = true \]; then echo "::error::/);
  });

  it('Dado o workflow, Quando procura credencial, Então não há segredo, token OIDC nem chamada à Anthropic (ADR-101)', () => {
    expect(semComentario(wf)).not.toContain('secrets.');
    expect(semComentario(wf)).not.toContain('ANTHROPIC');
    expect(semComentario(wf)).not.toContain('id-token');
    expect(job('julgar')).not.toContain('statuses:');
  });

  it('Dado o gatilho, Quando lê o workflow, Então roda pela base e não lê comentário', () => {
    const corpo = semComentario(wf);
    expect(corpo).toContain('pull_request_target');
    expect(corpo).not.toMatch(/issue_comment|pull_request_review|\.comments/);
  });

  it('Dado o código da PR, Quando o job roda, Então ele é só dado: sem npm ci no checkout do head e sem execução em pr/', () => {
    const corpo = semComentario(wf);
    expect(corpo).toContain('path: pr');
    expect(corpo).not.toMatch(/working-directory:\s*pr/);
    expect(corpo).not.toMatch(/cd pr/);
    expect(corpo.match(/npm ci --ignore-scripts/g)).toHaveLength(1);
  });

  it('Dado diff em caminho protegido, Quando o check agrega, Então exige o Environment do dono', () => {
    expect(job('humana')).toContain('environment: aprovacao-classe-3');
    expect(job('veredito')).toContain('R_HUMANA');
  });

  it('Dado PR para a main, Quando julga, Então confere a release e não exige a review do the-judge', () => {
    const julgar = job('julgar');
    const passo = julgar.slice(
      julgar.indexOf('- name: Conferir a review the-judge do head'),
    );
    expect(passo.split('\n').slice(0, 3).join('\n')).toContain(
      "github.base_ref != 'main'",
    );
    expect(julgar).toContain('conferir-release.ts');
  });

  it('Dado PR para a release, Quando julga, Então confere a review the-judge do head sem chamar o modelo (ADR-101)', () => {
    const julgar = job('julgar');
    expect(julgar).toContain('scripts/release/review-judge.ts');
    expect(julgar).toContain('github.event.pull_request.head.sha');
    expect(julgar).not.toContain('julgar-pr.ts --diff');
  });

  it('Dado nome de arquivo com acento, Quando o job classifica, Então usa a lista NUL do git (sem aspas) e não o cabeçalho do diff', () => {
    const julgar = job('julgar');
    expect(julgar).toMatch(/core\.quotePath=false diff --name-only -z/);
    expect(julgar).toContain('--arquivos');
  });

  it('Dado o job de aprovação do dono, Quando registra o diff aprovado, Então usa o SHA do head da PR e não o GITHUB_SHA da base', () => {
    const humana = job('humana');
    expect(humana).toContain('github.event.pull_request.head.sha');
    expect(humana).not.toContain('GITHUB_SHA');
  });
});
