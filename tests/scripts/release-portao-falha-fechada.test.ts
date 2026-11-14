import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  flagsDesconhecidas,
  riscoDiffVazioComHead,
} from '../../scripts/release/classificar-risco-lib';
import { arquivosDeNul, mudancasDeNul } from '../../scripts/release/diff-nul';

const raiz = path.resolve(import.meta.dirname, '../..');
const tsx = path.join(raiz, 'node_modules/.bin/tsx');

describe('portão de risco · saída de git diff -z (falha fechada)', () => {
  it('Dado caminhos separados por NUL, Quando lê, Então devolve nomes íntegros e ignora o NUL final', () => {
    expect(arquivosDeNul('a b.ts\0src/ação.ts\0')).toEqual([
      'a b.ts',
      'src/ação.ts',
    ]);
    expect(arquivosDeNul('')).toEqual([]);
  });

  it('Dado status e caminhos, Quando lê, Então devolve os pares e o caminho novo do rename', () => {
    expect(mudancasDeNul('A\0drizzle/0001_x.sql\0M\0a.ts\0')).toEqual([
      ['A', 'drizzle/0001_x.sql'],
      ['M', 'a.ts'],
    ]);
    expect(mudancasDeNul('R100\0velho.ts\0novo.ts\0C80\0x.ts\0y.ts\0')).toEqual(
      [
        ['R100', 'novo.ts'],
        ['C80', 'y.ts'],
      ],
    );
    expect(mudancasDeNul('')).toEqual([]);
  });

  it('Dado saída truncada, Quando lê, Então lança em vez de descartar o resto da lista', () => {
    expect(() => mudancasDeNul('A\0')).toThrow('malformada');
    expect(() => mudancasDeNul('M\0\0')).toThrow('malformada');
    expect(() => mudancasDeNul('R100\0velho.ts\0')).toThrow('malformada');
    expect(() => mudancasDeNul('R100\0velho.ts\0\0')).toThrow('malformada');
    expect(() => mudancasDeNul('A\0ok.sql\0M\0')).toThrow('malformada');
  });
});

describe('portão de risco · base sem suporte a --head (falha fechada)', () => {
  it('Dado diff vazio com --head, Quando classifica, Então é classe 3 com aprovação humana', () => {
    expect(riscoDiffVazioComHead()).toMatchObject({
      classe: 3,
      aprovacaoHumana: true,
      motivos: [expect.objectContaining({ regra: 'diff-vazio-com-head' })],
    });
  });

  it('Dado opções, Quando confere, Então devolve só as que o CLI não conhece', () => {
    const conhecidas = ['--base', '--head'];
    expect(
      flagsDesconhecidas(['--base', 'x', '--head', 'y'], conhecidas),
    ).toEqual([]);
    expect(
      flagsDesconhecidas(['--base', 'x', '--tipo', '--outra'], conhecidas),
    ).toEqual(['--tipo', '--outra']);
  });

  const dir = mkdtempSync(path.join(tmpdir(), 'portao-vazio-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]): string => {
    const r = spawnSync(
      'git',
      [
        '-C',
        dir,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return r.stdout.trim();
  };
  const cli = (script: string, ...args: string[]) =>
    spawnSync(tsx, [path.join(raiz, 'scripts/release', script), ...args], {
      cwd: dir,
      encoding: 'utf8',
    });

  it('Dado o CLI chamado com --head igual à base, Quando o diff é vazio, Então sai classe 3', () => {
    git('init', '-q', '-b', 'main');
    writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    const sha = git('rev-parse', 'HEAD');
    const r = cli(
      'classificar-risco.ts',
      '--base',
      sha,
      '--head',
      sha,
      '--saida-github',
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('classe=3');
    expect(r.stdout).toContain('aprovacao_humana=true');
  });

  it('Dado uma opção desconhecida, Quando o CLI roda, Então sai 1 sem classificar', () => {
    for (const script of ['classificar-risco.ts', 'check-migracao.ts']) {
      const r = cli(script, '--base', 'HEAD', '--cabeca', 'x');
      expect(r.status, script).toBe(1);
      expect(r.stderr).toContain('opção desconhecida: --cabeca');
    }
  });

  it('Dado o workflow, Quando a base não conhece --head, Então o passo força classe 3 antes de classificar', () => {
    const yml = readFileSync(
      path.join(raiz, '.github/workflows/portao-risco.yml'),
      'utf8',
    );
    const grep = yml.indexOf(
      `grep -qF -e "'--head'" scripts/release/classificar-risco.ts scripts/release/check-migracao.ts`,
    );
    const forca = yml.indexOf('classe=3');
    const classifica = yml.indexOf(
      'npm run --silent check:risco -- --saida-github',
    );
    expect(grep).toBeGreaterThan(-1);
    expect(forca).toBeGreaterThan(grep);
    expect(classifica).toBeGreaterThan(forca);
  });
});
