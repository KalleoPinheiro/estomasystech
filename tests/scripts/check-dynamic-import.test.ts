import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findTemplateImports,
  findViolations,
  listSources,
  run,
} from '../../scripts/check-dynamic-import';

const roots: string[] = [];

/** Repositório mínimo: só os arquivos pedidos, nas pastas que o gate varre. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dynamic-import-'));
  roots.push(root);
  for (const [path, source] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, source);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  vi.restoreAllMocks();
});

// `#{` vira o placeholder de template (o Biome reclama de `$`+`{` em string comum).
const fx = (source: string): string => source.replaceAll('#{', '$' + '{');

const TEMPLATE = fx('const m = await import(`@/app/api#{path}/route`);\n');

describe('Feature: gate de import() com template literal (#646)', () => {
  it.each([
    ['import(`@/app/api#{path}/route`)', 1],
    ['import(`#{dir}/x`)', 1],
    ['import(`@/a/#{x}/#{y}`)', 1],
    ['const a = 1;\n\nawait import(`./#{n}`);', 3],
  ])('Dado %j, Então aponta a linha %i', (source, line) => {
    expect(findTemplateImports('a.ts', fx(source))).toEqual([line]);
  });

  it.each([
    "import('@/app/api/x/route')",
    'import(`@/app/api/x/route`)',
    "const ROUTES = { '/x': () => import('@/app/api/x/route') } as const;",
    "// import(`@/app/api#{path}/route`)\nconst ok = 'import(`#{x}`)';",
    '/* import(`./#{x}`) */',
    'const s = `#{import.meta.url}`;',
    'require(`./#{x}`);',
    'import(path);',
    'import();',
  ])('Dado o código aceito %j, Então não há violação', (source) => {
    expect(findTemplateImports('a.ts', fx(source))).toEqual([]);
  });

  it('Dado um .tsx, Então também lê JSX', () => {
    const source = 'const C = () => <div>{import(`./#{x}`)}</div>;';
    expect(findTemplateImports('c.tsx', fx(source))).toEqual([1]);
  });

  it('Dado violações em src, tests, e2e e scripts, Então lista todas com caminho relativo', () => {
    const root = fixture({
      'src/a.ts': TEMPLATE,
      'tests/sub/b.test.ts': TEMPLATE,
      'e2e/c.spec.ts': TEMPLATE,
      'scripts/d.mts': TEMPLATE,
      'docs/ignorado.ts': TEMPLATE,
    });
    expect(findViolations(root)).toEqual([
      { file: 'src/a.ts', line: 1 },
      { file: 'tests/sub/b.test.ts', line: 1 },
      { file: 'e2e/c.spec.ts', line: 1 },
      { file: 'scripts/d.mts', line: 1 },
    ]);
  });

  it('Dado node_modules, .next e arquivo que não é código, Então ignora', () => {
    const root = fixture({
      'src/node_modules/x/index.ts': TEMPLATE,
      'src/.next/y.ts': TEMPLATE,
      'src/leia.md': TEMPLATE,
      'src/ok.ts': "import('./a');",
    });
    expect(findViolations(root)).toEqual([]);
    expect(listSources(join(root, 'src'))).toEqual([join(root, 'src/ok.ts')]);
  });

  it('Dado repositório sem violação, Então sai com 0', () => {
    const root = fixture({ 'src/a.ts': "import('./b');" });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(run(root)).toBe(0);
  });

  it('Dado repositório sem as pastas varridas, Então sai com 0', () => {
    const root = fixture({ 'docs/a.md': '# a' });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(run(root)).toBe(0);
  });

  it('Dado uma violação, Então sai com 1 e diz arquivo, linha e o jeito certo', () => {
    const root = fixture({ 'tests/a.test.ts': `\n${TEMPLATE}` });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(run(root)).toBe(1);
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining(
        'tests/a.test.ts:2: import() com template literal',
      ),
    );
    expect(err).toHaveBeenCalledWith(expect.stringContaining('mapa estático'));
  });
});
