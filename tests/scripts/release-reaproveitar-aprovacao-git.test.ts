import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { impressaoDoHead } from '../../scripts/release/reaproveitar-aprovacao-git';

// Separado dos testes puros da lib: este sobe git e tsx de verdade e fica fora da mutação (vitest.mutacao.config.mts).
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
    escrever(
      'src/lib/auth/session.ts',
      sensivel('// cabeçalho da main', ...linhas, ...linhas),
    );
    const base2 = commit('contexto repetido');
    git('checkout', '-q', '-b', 'repetido-pr');
    escrever(
      'src/lib/auth/session.ts',
      sensivel(
        '// cabeçalho da main',
        ...linhas.slice(0, 5),
        'export const novo = 1;',
        ...linhas.slice(5),
        ...linhas,
      ),
    );
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
