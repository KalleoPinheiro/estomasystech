import { describe, expect, it } from 'vitest';
import { analyzeConfigs } from '../../scripts/gate/gate-config';

const rules = (file: string, base: string | null, head: string | null) =>
  analyzeConfigs([{ file, base, head }]).map(
    (f) => `${f.severity}${f.kind ? `/${f.kind}` : ''}:${f.rule}`,
  );

const biome = (patch: {
  complexity?: number;
  lines?: number;
  includes?: string[];
  preset?: string;
}) =>
  JSON.stringify({
    files: { includes: patch.includes ?? ['**/src/**/*', '!**/.next'] },
    linter: {
      rules: {
        preset: patch.preset ?? 'recommended',
        complexity: {
          noExcessiveCognitiveComplexity: {
            level: 'error',
            options: { maxAllowedComplexity: patch.complexity ?? 10 },
          },
          noExcessiveLinesPerFunction: {
            level: 'error',
            options: { maxLines: patch.lines ?? 120 },
          },
        },
      },
    },
  });

describe('Regra 8: biome.json, limites, escopo e preset (#832)', () => {
  it('dado o mesmo biome.json, quando nada muda, não acusa', () => {
    expect(rules('biome.json', biome({}), biome({}))).toEqual([]);
  });
  it('quando sobe maxAllowedComplexity ou maxLines, é proibido', () => {
    expect(rules('biome.json', biome({}), biome({ complexity: 15 }))).toEqual([
      'hard:limite-de-lint-aumentado',
    ]);
    expect(rules('biome.json', biome({}), biome({ lines: 200 }))).toEqual([
      'hard:limite-de-lint-aumentado',
    ]);
  });
  it('quando o limite desce ou fica igual, passa', () => {
    expect(rules('biome.json', biome({}), biome({ complexity: 8 }))).toEqual(
      [],
    );
  });
  it('quando a opção do limite some, é proibido (volta ao padrão do biome)', () => {
    const head = JSON.stringify({
      files: { includes: ['**/src/**/*', '!**/.next'] },
      linter: {
        rules: {
          preset: 'recommended',
          complexity: {
            noExcessiveCognitiveComplexity: { level: 'error' },
            noExcessiveLinesPerFunction: {
              level: 'error',
              options: { maxLines: 120 },
            },
          },
        },
      },
    });
    expect(rules('biome.json', biome({}), head)).toEqual([
      'hard:limite-de-lint-removido',
    ]);
  });
  it('quando includes ganha exclusão com "!", é proibido', () => {
    expect(
      rules(
        'biome.json',
        biome({}),
        biome({ includes: ['**/src/**/*', '!**/.next', '!src/**'] }),
      ),
    ).toEqual(['hard:escopo-de-lint-reduzido']);
  });
  it('quando includes perde entrada positiva, é proibido', () => {
    expect(
      rules('biome.json', biome({}), biome({ includes: ['!**/.next'] })),
    ).toEqual(['hard:escopo-de-lint-reduzido']);
  });
  it('quando includes ganha entrada positiva ou o caminho some, passa', () => {
    expect(
      rules(
        'biome.json',
        biome({}),
        biome({ includes: ['**/src/**/*', '**/tests/**/*', '!**/.next'] }),
      ),
    ).toEqual([]);
    const semIncludes = JSON.stringify({
      ...JSON.parse(biome({})),
      files: {},
    });
    expect(rules('biome.json', biome({}), semIncludes)).toEqual([]);
  });
  it('quando includes do override some (passa a valer para todos), é proibido', () => {
    const override = (includes?: string[]) =>
      JSON.stringify({
        overrides: [
          { ...(includes ? { includes } : {}), linter: { enabled: false } },
        ],
      });
    expect(rules('biome.json', override(['tests/**']), override())).toEqual([
      'hard:escopo-de-lint-reduzido',
    ]);
  });
  it('quando as mesmas entradas de includes trocam de ordem, é proibido (a última vence)', () => {
    expect(
      rules(
        'biome.json',
        biome({ includes: ['!src/g/**', 'src/g/ok.ts'] }),
        biome({ includes: ['src/g/ok.ts', '!src/g/**'] }),
      ),
    ).toEqual(['hard:escopo-de-lint-reordenado']);
  });
  it('quando o preset some, pede GATE-ALTERADO, salvo se era recommended', () => {
    const semPreset = (text: string) => {
      const json = JSON.parse(text);
      delete json.linter.rules.preset;
      return JSON.stringify(json);
    };
    expect(
      rules('biome.json', biome({ preset: 'all' }), semPreset(biome({}))),
    ).toEqual(['justifiable/gate:preset-de-lint-alterado']);
    expect(rules('biome.json', biome({}), semPreset(biome({})))).toEqual([]);
  });
  it('quando o preset vira "none", é proibido, mesmo se não havia preset antes', () => {
    expect(rules('biome.json', biome({}), biome({ preset: 'none' }))).toEqual([
      'hard:preset-de-lint-desligado',
    ]);
    const semPreset = JSON.stringify({ linter: { rules: {} } });
    const comNone = JSON.stringify({ linter: { rules: { preset: 'none' } } });
    expect(rules('biome.json', semPreset, comNone)).toEqual([
      'hard:preset-de-lint-desligado',
    ]);
  });
  it('quando o preset muda para outro valor, pede GATE-ALTERADO', () => {
    expect(rules('biome.json', biome({}), biome({ preset: 'all' }))).toEqual([
      'justifiable/gate:preset-de-lint-alterado',
    ]);
  });
  it('quando biome.json começa com BOM, lê normalmente (sem falso positivo)', () => {
    expect(
      rules('biome.json', `\uFEFF${biome({})}`, `\uFEFF${biome({})} `),
    ).toEqual([]);
    expect(
      rules('biome.json', biome({}), `\uFEFF${biome({ complexity: 15 })}`),
    ).toEqual(['hard:limite-de-lint-aumentado']);
  });
});

describe('Regra 8: stryker.config.json, ignores e mutantes excluídos (#832)', () => {
  const stryker = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      mutate: ['src/domain/**/*.ts'],
      timeoutMS: 60000,
      thresholds: { break: 85 },
      ignorePatterns: ['.cursor/skills'],
      ...extra,
    });
  it('quando ignorePatterns ganha entrada, é proibido', () => {
    expect(
      rules(
        'stryker.config.json',
        stryker(),
        stryker({ ignorePatterns: ['.cursor/skills', 'src/domain'] }),
      ),
    ).toEqual(['hard:mutacao-ignore-adicionado']);
  });
  it('quando mutator.excludedMutations ganha entrada, é proibido', () => {
    expect(
      rules(
        'stryker.config.json',
        stryker(),
        stryker({ mutator: { excludedMutations: ['ArithmeticOperator'] } }),
      ),
    ).toEqual(['hard:mutacao-mutante-excluido']);
    expect(
      rules(
        'stryker.config.json',
        stryker({ mutator: { excludedMutations: ['StringLiteral'] } }),
        stryker({
          mutator: { excludedMutations: ['StringLiteral', 'BlockStatement'] },
        }),
      ),
    ).toEqual(['hard:mutacao-mutante-excluido']);
  });
  it('quando as listas encolhem ou ficam iguais, passa', () => {
    expect(
      rules(
        'stryker.config.json',
        stryker({ mutator: { excludedMutations: ['StringLiteral'] } }),
        stryker({ ignorePatterns: [] }),
      ),
    ).toEqual([]);
  });
});

describe('Regra 8: job de shard condicionado no ci.yml (#832)', () => {
  const ci = (ifLine: string | null, extra = '') =>
    [
      'jobs:',
      '  escopo:',
      '    if: true',
      '  cobertura-shard:',
      '    name: Cobertura (shard ${{ matrix.shard }}/4)',
      ...(ifLine === null ? [] : [`    if: ${ifLine}`]),
      '    strategy:',
      '      matrix:',
      '        shard: [1, 2, 3, 4]',
      extra,
      '  cobertura:',
      '    needs: cobertura-shard',
    ].join('\n');
  const BASE = ci("needs.escopo.outputs.pesado == 'true'");
  it('quando o if do job de shard vira false, é proibido', () => {
    expect(rules('.github/workflows/ci.yml', BASE, ci('false'))).toEqual([
      'hard:shard-condicionado',
    ]);
    expect(
      rules('.github/workflows/ci.yml', BASE, ci(`$\{{ false }}`)),
    ).toEqual(['hard:shard-condicionado']);
  });
  it('quando o if some ou aparece onde não havia, é proibido', () => {
    expect(rules('.github/workflows/ci.yml', BASE, ci(null))).toEqual([
      'hard:shard-condicionado',
    ]);
    expect(rules('.github/workflows/ci.yml', ci(null), BASE)).toEqual([
      'hard:shard-condicionado',
    ]);
  });
  it('quando o if só muda de forma (aspas, espaços, interpolação, comentário), passa', () => {
    const mesmo = `$\{{ needs.escopo.outputs.pesado   ==  'true' }} # igual`;
    expect(rules('.github/workflows/ci.yml', BASE, ci(mesmo))).toEqual([]);
    expect(
      rules('.github/workflows/ci.yml', ci('"a == b"'), ci("'a == b'")),
    ).toEqual([]);
  });
  it('quando a expressão troca false por string "false", ou muda espaço dentro de literal, é proibido', () => {
    const exp = (e: string) => ci(`$\{{ ${e} }}`);
    expect(
      rules('.github/workflows/ci.yml', exp('false'), exp("'false'")),
    ).toEqual(['hard:shard-condicionado']);
    expect(
      rules('.github/workflows/ci.yml', exp("a == 'x y'"), exp("a == 'x  y'")),
    ).toEqual(['hard:shard-condicionado']);
  });
  it('quando o job tem matriz shard com outro nome, ou chave entre aspas, também vale', () => {
    const job = (key: string, cond: string) =>
      `jobs:\n  ${key}:\n    if: ${cond}\n    strategy:\n      matrix:\n        shard: [1, 2]\n`;
    expect(
      rules(
        '.github/workflows/ci.yml',
        job('cobertura', 'a'),
        job('cobertura', 'false'),
      ),
    ).toEqual(['hard:shard-condicionado']);
    expect(
      rules(
        '.github/workflows/ci.yml',
        job('fatia-shard', 'a'),
        job('"fatia-shard"', 'false'),
      ),
    ).toEqual(['hard:shard-condicionado']);
  });
  it('quando outro job (não shard) muda o if ou o step tem if próprio, não acusa', () => {
    const outro = BASE.replace('    if: true', '    if: false');
    expect(rules('.github/workflows/ci.yml', BASE, outro)).toEqual([]);
    const passo = ci(
      "needs.escopo.outputs.pesado == 'true'",
      '    steps:\n      - if: false\n        run: x',
    );
    expect(rules('.github/workflows/ci.yml', BASE, passo)).toEqual([]);
  });
  it('quando só o if do shard some, é proibido; sem shard no HEAD, vale a regra da matriz', () => {
    const sem = BASE.split('\n')
      .filter((l) => !l.includes('if: needs'))
      .join('\n');
    expect(rules('.github/workflows/ci.yml', BASE, sem)).toEqual([
      'hard:shard-condicionado',
    ]);
    expect(
      rules('.github/workflows/gate-pr.yml', BASE, 'jobs:\n  x:\n    if: a'),
    ).toEqual(['hard:shard-removido']);
  });
});
