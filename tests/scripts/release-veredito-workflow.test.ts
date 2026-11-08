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

  it('Dado o workflow, Quando procura credencial da API, Então não há segredo e só o job julgar pede o token OIDC', () => {
    expect(semComentario(wf)).not.toContain('secrets.');
    expect(semComentario(wf)).not.toContain('ANTHROPIC_API_KEY');
    for (const nome of ['humana', 'veredito'])
      expect(job(nome)).not.toContain('id-token');
    expect(semComentario(wf).match(/id-token: write/g)).toHaveLength(1);
    expect(job('julgar')).toContain('id-token: write');
    expect(job('julgar')).toContain('vars.ANTHROPIC_FEDERATION_RULE_ID');
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

  it('Dado diff em caminho protegido, Quando o check agrega, Então exige o Environment do dono e o veredito fica fixo por SHA', () => {
    expect(job('humana')).toContain('environment: aprovacao-classe-3');
    expect(job('veredito')).toContain('R_HUMANA');
    expect(job('julgar')).toContain('actions/cache/restore');
    expect(job('julgar')).toContain('actions/cache/save');
    expect(job('julgar')).toMatch(
      /veredito-judge-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/,
    );
  });

  it('Dado PR para a main, Quando julga, Então não chama o modelo', () => {
    const julgar = job('julgar');
    const passoModelo = julgar.slice(julgar.indexOf('- name: Julgar\n'));
    expect(passoModelo.split('\n').slice(0, 3).join('\n')).toContain(
      "github.base_ref != 'main'",
    );
    expect(julgar).toContain('conferir-release.ts');
  });

  it('Dado nome de arquivo com acento, Quando o job classifica, Então usa a lista NUL do git (sem aspas) e não o cabeçalho do diff', () => {
    const julgar = job('julgar');
    expect(julgar).toMatch(/core\.quotePath=false diff --name-only -z/);
    expect(julgar).toContain('--arquivos');
  });

  it('Dado falha da API, Quando o job julga, Então o passo que grava no cache só roda se um passo próprio achou o arquivo (hashFiles não enxerga RUNNER_TEMP)', () => {
    const julgar = job('julgar');
    expect(semComentario(julgar)).not.toContain('hashFiles');
    expect(julgar).toContain('id: existe');
    expect(julgar).toMatch(
      /\[ -f "\$RUNNER_TEMP\/veredito\/veredito\.json" \]/,
    );
    expect(julgar).toMatch(
      /name: Gravar o veredito deste SHA\n\s+if: always\(\) && steps\.existe\.outputs\.existe == 'true'/,
    );
  });
});
