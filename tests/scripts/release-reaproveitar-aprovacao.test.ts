import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { ResultadoRisco } from '../../scripts/release/classificar-risco-lib';
import { impressaoDoHead } from '../../scripts/release/reaproveitar-aprovacao-git';
import {
  AMBIENTE_APROVACAO,
  aprovadaPeloDono,
  arquivosDaImpressao,
  execucaoDaPr,
  impressao,
  localAmbiguo,
  NOME_JOB_APROVACAO,
  saidaReaproveitamento,
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
    ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -1,2 +1,3 @@', ...antes.map((l) => ` ${l}`), '+novo'].join('\n');

  it('Dado contexto que aparece uma vez na base, Quando confere, Então o lugar é único', () => {
    expect(localAmbiguo(diff(['a', 'b']), () => 'a\nb\nc\n')).toBe(false);
  });

  it('Dado contexto repetido, arquivo ausente na base ou hunk sem contexto, Quando confere, Então é ambíguo (falha fechada)', () => {
    expect(localAmbiguo(diff(['a', 'b']), () => 'a\nb\nx\na\nb\n')).toBe(true);
    expect(localAmbiguo(diff(['a', 'b']), () => null)).toBe(true);
    expect(localAmbiguo(diff([]), () => 'a\n')).toBe(true);
  });

  it('Dado arquivo novo, Quando confere, Então não há o que comparar e não é ambíguo', () => {
    const novo = ['diff --git a/n.ts b/n.ts', 'new file mode 100644', '--- /dev/null', '+++ b/n.ts', '@@ -0,0 +1 @@', '+x'].join('\n');
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

describe('reaproveitar aprovação de classe 3 · git de verdade (ADR-117)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reaproveitar-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) => {
    const r = spawnSync(
      'git',
      [
        '-c',
        'user.email=t@t',
        '-c',
        'user.name=t',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: dir, encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  const escrever = (arquivo: string, texto: string) => {
    mkdirSync(path.dirname(path.join(dir, arquivo)), { recursive: true });
    writeFileSync(path.join(dir, arquivo), texto);
  };
  const commit = (msg: string) => {
    git('add', '-A');
    git('commit', '-q', '-m', msg);
    return git('rev-parse', 'HEAD');
  };

  const linhas = Array.from(
    { length: 10 },
    (_, i) => `export const l${i} = ${i};`,
  );
  const sensivel = (...l: string[]) => `${l.join('\n')}\n`;

  git('init', '-q', '-b', 'main');
  escrever('src/lib/auth/session.ts', sensivel(...linhas));
  escrever('docs/fila.md', 'linha base\n');
  commit('base');
  git('checkout', '-q', '-b', 'pr');
  escrever(
    'src/lib/auth/session.ts',
    sensivel(...linhas, 'export const novo = 1;'),
  );
  escrever('docs/fila.md', 'linha do PR\n');
  const aprovado = commit('pr');
  git('checkout', '-q', 'main');
  // A main mexe no topo do arquivo sensível (longe do trecho da PR) e na fila (conflito com a PR).
  escrever(
    'src/lib/auth/session.ts',
    sensivel('// cabeçalho da main', ...linhas),
  );
  escrever('docs/fila.md', 'linha da main\n');
  const main = commit('main andou');
  git('checkout', '-q', 'pr');
  spawnSync('git', ['merge', '-q', 'main'], { cwd: dir });
  escrever(
    'src/lib/auth/session.ts',
    sensivel('// cabeçalho da main', ...linhas, 'export const novo = 1;'),
  );
  escrever('docs/fila.md', 'linha do PR e da main\n');
  const atualizado = commit('merge da main com conflito na fila');

  it('Dado merge da main que desloca o arquivo sensível e resolve conflito fora da classe 3, Quando compara, Então a impressão é a mesma', () => {
    const antes = impressaoDoHead(main, aprovado, dir);
    expect(antes).toMatch(/^[0-9a-f]{64}$/);
    expect(impressaoDoHead(main, atualizado, dir)).toBe(antes);
  });

  it('Dado o mesmo trecho sensível em outro lugar do arquivo, Quando compara, Então a impressão muda (o contexto conta)', () => {
    git('checkout', '-q', '-b', 'outro-lugar', main);
    escrever(
      'src/lib/auth/session.ts',
      sensivel('// cabeçalho da main', 'export const novo = 1;', ...linhas),
    );
    const outroLugar = commit('mesmo trecho no topo');
    expect(impressaoDoHead(main, outroLugar, dir)).not.toBe(
      impressaoDoHead(main, aprovado, dir),
    );
  });

  it('Dado mudança no arquivo sensível depois da aprovação, Quando compara, Então a impressão muda', () => {
    git('checkout', '-q', 'pr');
    escrever(
      'src/lib/auth/session.ts',
      sensivel('// cabeçalho da main', ...linhas, 'export const novo = 2;'),
    );
    const mudou = commit('mexeu no sensível');
    expect(impressaoDoHead(main, mudou, dir)).not.toBe(
      impressaoDoHead(main, aprovado, dir),
    );
  });

  it('Dado o arquivo sensível com o mesmo contexto em dois lugares, Quando calcula, Então não há impressão (o lugar seria ambíguo)', () => {
    git('checkout', '-q', '-b', 'repetido', main);
    escrever('src/lib/auth/session.ts', sensivel('// cabeçalho da main', ...linhas, ...linhas));
    const base2 = commit('contexto repetido');
    git('checkout', '-q', '-b', 'repetido-pr');
    escrever('src/lib/auth/session.ts', sensivel('// cabeçalho da main', ...linhas.slice(0, 5), 'export const novo = 1;', ...linhas.slice(5), ...linhas));
    const pr2 = commit('edição num dos dois lugares');
    expect(impressaoDoHead(base2, pr2, dir)).toBeNull();
  });

  it('Dado head sem classe 3 ou ref inexistente, Quando calcula, Então não há impressão', () => {
    git('checkout', '-q', '-b', 'so-docs', main);
    escrever('docs/fila.md', 'só doc\n');
    const soDocs = commit('só docs');
    expect(impressaoDoHead(main, soDocs, dir)).toBeNull();
    expect(impressaoDoHead(main, 'f'.repeat(40), dir)).toBeNull();
  });
});
