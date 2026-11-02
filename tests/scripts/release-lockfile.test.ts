import { describe, expect, it } from 'vitest';
import {
  conferirNpm,
  npmFixado,
  opcionaisDoLockfile,
  opcionaisPerdidos,
  verificarLockfile,
} from '../../scripts/release/lockfile-lib';
import { pendenciasDoPreflight } from '../../scripts/release/preflight-lib';

const lock = (packages: Record<string, { optional?: boolean }>): string =>
  JSON.stringify({ lockfileVersion: 3, packages });

const COMPLETO = {
  '': {},
  'node_modules/next': {},
  'node_modules/@img/sharp-linux-x64': { optional: true },
  'node_modules/@img/sharp-darwin-arm64': { optional: true },
  'node_modules/@next/swc-win32-x64-msvc': { optional: true },
};

describe('Feature: lockfile não pode perder dependências opcionais no corte (ADR-091)', () => {
  it('Dado um lockfile igual antes e depois, Quando confiro, Então está íntegro', () => {
    expect(verificarLockfile(lock(COMPLETO), lock(COMPLETO))).toBeNull();
  });

  it('Dado que o npm regenerou o lockfile só com a plataforma local, Quando confiro, Então reprova e nomeia as perdas', () => {
    const {
      'node_modules/@img/sharp-darwin-arm64': _a,
      'node_modules/@next/swc-win32-x64-msvc': _b,
      ...so
    } = COMPLETO;
    const erro = verificarLockfile(lock(COMPLETO), lock(so));
    expect(erro).toContain('perdeu 2 dependência(s) opcional(is)');
    expect(erro).toContain('node_modules/@img/sharp-darwin-arm64');
    expect(erro).toContain('node_modules/@next/swc-win32-x64-msvc');
    expect(erro).not.toContain('e mais');
  });

  it('Dado que mais de cinco opcionais sumiram, Quando confiro, Então lista cinco e conta o resto', () => {
    const muitos = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `node_modules/@x/p${i}`,
        { optional: true },
      ]),
    );
    const erro = verificarLockfile(lock(muitos), lock({}));
    expect(erro).toContain('perdeu 8');
    expect(erro).toContain('e mais 3');
  });

  it('Dado que uma opcional foi só desmarcada (virou obrigatória), Quando confiro, Então não é perda', () => {
    const depois = { ...COMPLETO, 'node_modules/@img/sharp-linux-x64': {} };
    expect(verificarLockfile(lock(COMPLETO), lock(depois))).toBeNull();
  });

  it('Dado que o lockfile ganhou opcionais, Quando confiro, Então não é perda', () => {
    expect(verificarLockfile(lock({}), lock(COMPLETO))).toBeNull();
  });

  it('Dado um lockfile sem `packages`, Quando listo as opcionais, Então vem vazio', () => {
    expect(opcionaisDoLockfile({})).toEqual([]);
    expect(opcionaisPerdidos({}, {})).toEqual([]);
    expect(
      opcionaisPerdidos(
        { packages: { 'node_modules/a': { optional: true } } },
        {},
      ),
    ).toEqual(['node_modules/a']);
  });

  it('Dado um pacote com entrada indefinida, Quando listo as opcionais, Então ignora', () => {
    expect(
      opcionaisDoLockfile({
        packages: {
          'node_modules/a': undefined,
          'node_modules/b': { optional: true },
        },
      }),
    ).toEqual(['node_modules/b']);
  });
});

describe('Feature: npm fixado no package.json (ADR-091)', () => {
  const pkg = { packageManager: 'npm@11.21.1' };

  it.each([
    ['npm@11.21.1', '11.21.1'],
    ['pnpm@9.0.0', null],
    ['npm@11', null],
    ['npm@11.21.1+sha512.abc', null],
    [undefined, null],
  ])(
    'Dado packageManager %s, Então o npm fixado é %s',
    (packageManager, esperado) => {
      expect(npmFixado({ packageManager })).toBe(esperado);
    },
  );

  it('Dado o npm fixado em uso, Quando confiro, Então passa (inclusive com quebra de linha)', () => {
    expect(conferirNpm(pkg, '11.21.1')).toBeNull();
    expect(conferirNpm(pkg, '11.21.1\n')).toBeNull();
  });

  it('Dado outro npm em uso, Quando confiro, Então reprova com a instrução de instalar o fixo', () => {
    expect(conferirNpm(pkg, '11.6.2')).toBe(
      'npm 11.6.2 em uso, mas o package.json fixa 11.21.1: rode `npm i -g npm@11.21.1` (ADR-091).',
    );
    expect(conferirNpm(pkg, '')).toContain('(desconhecido)');
  });

  it('Dado package.json sem packageManager de npm, Quando confiro, Então reprova', () => {
    expect(conferirNpm({}, '11.21.1')).toContain('deve fixar o npm');
  });

  it('Dado o package.json real do repositório, Então fixa o npm e o engines concorda', async () => {
    const real = (await import('../../package.json')).default as {
      packageManager?: string;
      engines?: { npm?: string };
    };
    expect(npmFixado(real)).not.toBeNull();
    expect(real.engines?.npm).toBe(npmFixado(real));
  });

  it('Dado o pré-voo com npm divergente, Então vira falha do pré-voo; com o npm certo, passa', () => {
    const base = {
      token: 't',
      repo: 'o/r',
      gitName: 'n',
      gitEmail: 'e',
      rollbackOk: true,
      emCi: true,
    };
    expect(
      pendenciasDoPreflight({ ...base, npm: { pkg, atual: '10.9.9' } }),
    ).toHaveLength(1);
    expect(
      pendenciasDoPreflight({ ...base, npm: { pkg, atual: '11.21.1' } }),
    ).toEqual([]);
    expect(pendenciasDoPreflight(base)).toEqual([]);
  });
});
