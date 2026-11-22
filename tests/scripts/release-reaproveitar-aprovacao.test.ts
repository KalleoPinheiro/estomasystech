import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ResultadoRisco } from '../../scripts/release/classificar-risco-lib';
import {
  AMBIENTE_APROVACAO,
  aprovadaPeloDono,
  arquivosDaImpressao,
  execucaoDaPr,
  impressao,
  localAmbiguo,
  NOME_JOB_APROVACAO,
  saidaReaproveitamento,
  shaValido,
} from '../../scripts/release/reaproveitar-aprovacao-lib';

const classe3 = (motivos: ResultadoRisco['motivos']): ResultadoRisco => ({
  schema: 'classificar-risco/v1',
  classe: 3,
  aprovacaoHumana: true,
  motivos,
});
const auth = {
  classe: 3 as const,
  regra: 'auth',
  arquivo: 'src/lib/auth/session.ts',
  detalhe: 'auth',
};
const PATCH = `${'a'.repeat(40)} ${'0'.repeat(40)}\n`;

describe('reaproveitar aprovação de classe 3 · impressão (ADR-117)', () => {
  it('Dado motivos de classe 3 com arquivo, Quando monta, Então devolve os arquivos ordenados e o lockfile junto da dependência', () => {
    const dep = {
      classe: 3 as const,
      regra: 'dependencia-sensivel',
      arquivo: 'package.json',
      detalhe: 'dependência sensível alterada: pg',
    };
    expect(arquivosDaImpressao(classe3([auth, dep]))).toEqual([
      'package-lock.json',
      'package.json',
      'src/lib/auth/session.ts',
    ]);
  });

  it('Dado classe abaixo de 3, motivo sem arquivo ou lista vazia, Quando monta, Então não há impressão (falha fechada)', () => {
    expect(
      arquivosDaImpressao({
        ...classe3([auth]),
        classe: 1,
        aprovacaoHumana: false,
      }),
    ).toBeNull();
    expect(
      arquivosDaImpressao(
        classe3([{ classe: 3, regra: 'diff-vazio-com-head', detalhe: 'x' }]),
      ),
    ).toBeNull();
    expect(arquivosDaImpressao(classe3([{ ...auth, classe: 2 }]))).toBeNull();
    expect(arquivosDaImpressao(classe3([]))).toBeNull();
  });

  it('Dado o mesmo conteúdo, Quando calcula, Então a impressão é estável e muda com motivo ou patch-id diferente', () => {
    const a = impressao(classe3([auth]), PATCH);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(impressao(classe3([auth]), PATCH)).toBe(a);
    expect(
      impressao(
        classe3([{ ...auth, arquivo: 'src/lib/auth/outro.ts' }]),
        PATCH,
      ),
    ).not.toBe(a);
    expect(impressao(classe3([auth]), `${'b'.repeat(40)} x`)).not.toBe(a);
  });

  it('Dado patch-id vazio ou malformado, Quando calcula, Então não há impressão', () => {
    expect(impressao(classe3([auth]), '')).toBeNull();
    expect(impressao(classe3([auth]), 'nao-e-sha')).toBeNull();
  });
});

describe('reaproveitar aprovação de classe 3 · lugar único do trecho (ADR-117)', () => {
  const diff = (antes: string[]) =>
    [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,2 +1,3 @@',
      ...antes.map((l) => ` ${l}`),
      '+novo',
    ].join('\n');

  it('Dado contexto que aparece uma vez na base, Quando confere, Então o lugar é único', () => {
    expect(localAmbiguo(diff(['a', 'b']), () => 'a\nb\nc\n')).toBe(false);
  });

  it('Dado contexto repetido, arquivo ausente na base ou hunk sem contexto, Quando confere, Então é ambíguo (falha fechada)', () => {
    expect(localAmbiguo(diff(['a', 'b']), () => 'a\nb\nx\na\nb\n')).toBe(true);
    expect(localAmbiguo(diff(['a', 'b']), () => null)).toBe(true);
    expect(localAmbiguo(diff([]), () => 'a\n')).toBe(true);
  });

  it('Dado arquivo novo, Quando confere, Então não há o que comparar e não é ambíguo', () => {
    const novo = [
      'diff --git a/n.ts b/n.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/n.ts',
      '@@ -0,0 +1 @@',
      '+x',
    ].join('\n');
    expect(localAmbiguo(novo, () => null)).toBe(false);
  });
});

describe('reaproveitar aprovação de classe 3 · histórico do Actions (ADR-117)', () => {
  const execucao = {
    id: 1,
    head_sha: 'c'.repeat(40),
    html_url: 'https://github.com/x/y/actions/runs/1',
    event: 'pull_request',
    pull_requests: [{ number: 7 }],
  };

  it('Dado execução de outra PR, de outro evento ou com SHA inválido, Quando filtra, Então só a desta PR passa', () => {
    expect(execucaoDaPr(execucao, 7)).toBe(true);
    expect(execucaoDaPr(execucao, 8)).toBe(false);
    expect(execucaoDaPr({ ...execucao, event: 'merge_group' }, 7)).toBe(false);
    expect(execucaoDaPr({ ...execucao, head_sha: 'x' }, 7)).toBe(false);
    expect(execucaoDaPr({ ...execucao, pull_requests: null }, 7)).toBe(false);
  });

  it('Dado job verde e registro de aprovação no Environment, Quando confere, Então o dono aprovou', () => {
    const jobs = [{ name: NOME_JOB_APROVACAO, conclusion: 'success' }];
    const registro = [
      { state: 'approved', environments: [{ name: AMBIENTE_APROVACAO }] },
    ];
    expect(aprovadaPeloDono(jobs, registro)).toBe(true);
  });

  it('Dado só o job verde, só o registro, registro rejeitado ou de outro Environment, Quando confere, Então não reaproveita', () => {
    const jobs = [{ name: NOME_JOB_APROVACAO, conclusion: 'success' }];
    const registro = [
      { state: 'approved', environments: [{ name: AMBIENTE_APROVACAO }] },
    ];
    expect(aprovadaPeloDono(jobs, [])).toBe(false);
    expect(aprovadaPeloDono([], registro)).toBe(false);
    expect(
      aprovadaPeloDono([{ ...jobs[0], conclusion: 'skipped' }], registro),
    ).toBe(false);
    expect(
      aprovadaPeloDono(jobs, [
        { state: 'rejected', environments: [{ name: AMBIENTE_APROVACAO }] },
      ]),
    ).toBe(false);
    expect(
      aprovadaPeloDono(jobs, [
        { state: 'approved', environments: [{ name: 'producao' }] },
      ]),
    ).toBe(false);
    expect(
      aprovadaPeloDono(jobs, [{ state: 'approved', environments: null }]),
    ).toBe(false);
  });

  it('Dado o resultado, Quando formata, Então só põe a origem https quando reaproveitou', () => {
    expect(saidaReaproveitamento({ reaproveitada: false, motivo: 'x' })).toBe(
      'reaproveitada=false',
    );
    expect(
      saidaReaproveitamento({
        reaproveitada: true,
        origem: 'https://github.com/r/1',
        motivo: 'x',
      }),
    ).toBe('reaproveitada=true\naprovacao_origem=https://github.com/r/1');
    expect(
      saidaReaproveitamento({
        reaproveitada: true,
        origem: 'javascript:x\nreaproveitada=true',
        motivo: 'x',
      }),
    ).toBe('reaproveitada=true');
  });
});

describe('reaproveitar aprovação de classe 3 · bordas (ADR-117)', () => {
  const hex = 'a'.repeat(40);
  const hunk = (cabecalho: string, linhas: string[]) =>
    [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      cabecalho,
      ...linhas,
      '+novo',
    ].join('\n');

  it('Dado o workflow do portão, Quando lê, Então o job e o Environment têm os nomes que a lib procura', () => {
    const yml = readFileSync('.github/workflows/portao-risco.yml', 'utf8');
    expect(NOME_JOB_APROVACAO).toBe('Aprovação do dono (classe 3)');
    expect(AMBIENTE_APROVACAO).toBe('aprovacao-classe-3');
    expect(yml).toContain(`name: ${NOME_JOB_APROVACAO}`);
    expect(yml).toContain(`environment: ${AMBIENTE_APROVACAO}`);
  });

  it('Dado SHA com caractere antes ou depois, Quando valida, Então recusa', () => {
    expect(shaValido(hex)).toBe(true);
    expect(shaValido(`x${hex}`)).toBe(false);
    expect(shaValido(`${hex}x`)).toBe(false);
  });

  it('Dado só motivo que não é de dependência, Quando monta, Então o lockfile não entra', () => {
    expect(arquivosDaImpressao(classe3([auth]))).toEqual([
      'src/lib/auth/session.ts',
    ]);
  });

  it('Dado patch-id com espaço antes ou motivos em outra ordem, Quando calcula, Então a impressão é a mesma', () => {
    const outro = {
      ...auth,
      regra: 'cifra',
      arquivo: 'src/lib/crypto.ts',
      detalhe: 'cifra',
    };
    const ref = impressao(classe3([auth, outro]), PATCH);
    expect(ref).not.toBeNull();
    expect(impressao(classe3([auth, outro]), `\n  ${PATCH}`)).toBe(ref);
    expect(impressao(classe3([outro, auth]), PATCH)).toBe(ref);
  });

  it('Dado job de aprovação que não terminou com sucesso, Quando confere, Então não reaproveita mesmo com registro', () => {
    const registro = [
      { state: 'approved', environments: [{ name: AMBIENTE_APROVACAO }] },
    ];
    expect(
      aprovadaPeloDono(
        [{ name: NOME_JOB_APROVACAO, conclusion: 'failure' }],
        registro,
      ),
    ).toBe(false);
    expect(
      aprovadaPeloDono([{ name: 'outro', conclusion: 'success' }], registro),
    ).toBe(false);
  });

  it('Dado origem sem reaproveitamento ou fora do formato https, Quando formata, Então não põe a origem', () => {
    const r = { motivo: 'x', origem: 'https://github.com/x/y/actions/runs/1' };
    expect(saidaReaproveitamento({ ...r, reaproveitada: false })).toBe(
      'reaproveitada=false',
    );
    expect(
      saidaReaproveitamento({
        ...r,
        reaproveitada: true,
        origem: 'javascript:https://x',
      }),
    ).toBe('reaproveitada=true');
    expect(
      saidaReaproveitamento({
        ...r,
        reaproveitada: true,
        origem: 'https://x y',
      }),
    ).toBe('reaproveitada=true');
  });

  it('Dado cabeçalho de hunk com nome de função, Quando confere, Então o hunk entra na comparação', () => {
    expect(
      localAmbiguo(
        hunk('@@ -1,2 +1,3 @@ function f()', [' a', ' b']),
        () => 'a\nb\nx\na\nb\n',
      ),
    ).toBe(true);
  });

  it('Dado linha removida que distingue o lugar, Quando confere, Então ela conta no lado antes', () => {
    expect(
      localAmbiguo(
        hunk('@@ -1,2 +1,2 @@', [' a', '-velho']),
        () => 'a\nvelho\nz\na\nnovo\n',
      ),
    ).toBe(false);
  });

  it('Dado trecho no fim do arquivo ou só parecido em outro lugar, Quando confere, Então o lugar é único', () => {
    expect(
      localAmbiguo(hunk('@@ -2,2 +2,3 @@', [' a', ' b']), () => 'x\na\nb'),
    ).toBe(false);
    expect(
      localAmbiguo(hunk('@@ -3,2 +3,3 @@', [' a', ' b']), () => 'a\nc\na\nb\n'),
    ).toBe(false);
  });

  it('Dado o nome do arquivo no diff, Quando confere, Então busca a base pelo mesmo caminho', () => {
    const base = (arquivo: string) =>
      arquivo === 'x.ts' ? 'a\nb\n' : 'a\nb\na\nb\n';
    expect(localAmbiguo(hunk('@@ -1,2 +1,3 @@', [' a', ' b']), base)).toBe(
      false,
    );
  });

  it('Dado arquivo binário depois de um texto, Quando confere, Então os dados do binário não entram no hunk anterior', () => {
    const diff = [
      hunk('@@ -1,2 +1,3 @@', [' a', ' b']),
      'diff --git a/i.png b/i.png',
      'GIT binary patch',
      'literal 3',
      '-a',
    ].join('\n');
    expect(localAmbiguo(diff, () => 'a\nb\n-a\n')).toBe(false);
  });
});
