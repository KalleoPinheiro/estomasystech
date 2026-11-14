import { describe, expect, it } from 'vitest';
import {
  analyzeConfigs,
  type ConfigPair,
  isGatedConfig,
  parseJsonc,
} from '../../scripts/gate/gate-config';
import {
  findGateReason,
  findReason,
  judge,
} from '../../scripts/gate/test-integrity';

const rules = (file: string, base: string | null, head: string | null) =>
  analyzeConfigs([{ file, base, head } satisfies ConfigPair]).map(
    (f) => `${f.severity}${f.kind ? `/${f.kind}` : ''}:${f.rule}`,
  );

const STRYKER = JSON.stringify({
  mutate: ['src/domain/**/*.ts', '!src/**/index.ts'],
  timeoutMS: 60000,
  thresholds: { high: 90, low: 70, break: 85 },
});
const withStryker = (patch: Record<string, unknown>) =>
  JSON.stringify({ ...JSON.parse(STRYKER), ...patch });

describe('Regra 8: configurações do gate comparadas base × HEAD (#732)', () => {
  describe('dado o Stryker', () => {
    it('quando o break cai, ou some, é proibido', () => {
      expect(
        rules(
          'stryker.config.json',
          STRYKER,
          withStryker({ thresholds: { break: 70 } }),
        ),
      ).toEqual(['hard:limiar-de-mutacao-reduzido']);
      expect(
        rules(
          'stryker.config.json',
          STRYKER,
          withStryker({ thresholds: { high: 90, low: 70 } }),
        ),
      ).toEqual(['hard:limiar-de-mutacao-removido']);
      expect(
        rules(
          'stryker.config.json',
          STRYKER,
          withStryker({ thresholds: undefined }),
        ),
      ).toEqual(['hard:limiar-de-mutacao-removido']);
    });
    it('quando o timeout da mutação sobe, é proibido', () => {
      expect(
        rules(
          'stryker.config.json',
          STRYKER,
          withStryker({ timeoutMS: 90000 }),
        ),
      ).toEqual(['hard:retry-ou-timeout-aumentado']);
    });
    it('quando tira arquivo de mutate ou exclui com "!", é proibido', () => {
      expect(
        rules(
          'stryker.config.json',
          STRYKER,
          withStryker({ mutate: ['!src/**/index.ts'] }),
        ),
      ).toEqual(['hard:mutacao-escopo-reduzido']);
      expect(
        rules(
          'stryker.config.json',
          STRYKER,
          withStryker({
            mutate: ['src/domain/**/*.ts', '!src/**/index.ts', '!src/x/**'],
          }),
        ),
      ).toEqual(['hard:mutacao-escopo-reduzido']);
    });
    it('quando acrescenta entrada ao fim de mutate (ex.: scripts/release), não acusa nada', () => {
      expect(
        rules(
          'stryker.config.json',
          STRYKER,
          withStryker({
            mutate: [
              'src/domain/**/*.ts',
              '!src/**/index.ts',
              'scripts/release/**/*.ts',
            ],
          }),
        ),
      ).toEqual([]);
    });
    it('quando o arquivo some (apagado ou renomeado) ou fica ilegível, é proibido', () => {
      expect(rules('stryker.config.json', STRYKER, null)).toEqual([
        'hard:config-do-gate-removida',
      ]);
      expect(rules('stryker.config.json', STRYKER, '{ não é json')).toEqual([
        'hard:config-do-gate-ilegivel',
      ]);
    });
    it('quando nada muda ou o arquivo é novo, passa', () => {
      expect(rules('stryker.config.json', STRYKER, STRYKER)).toEqual([]);
      expect(rules('stryker.config.json', null, STRYKER)).toEqual([]);
    });
  });

  describe('dado o biome.json', () => {
    const BIOME = `{
      // comentário
      "linter": { "enabled": true, "rules": { "suspicious": { "noExplicitAny": "error", "noFoo": ["error", {"a": 1}], }, } },
      "overrides": [ { "includes": ["a"], "linter": { "rules": { "complexity": { "noExcessiveLinesPerFunction": "off" } } } } ]
    }`;
    const edit = (from: string, to: string) => BIOME.replace(from, to);
    it('lê JSONC com comentário e vírgula sobrando', () => {
      expect(parseJsonc(BIOME)).toMatchObject({ linter: { enabled: true } });
    });
    it('quando rebaixa error para off, warn ou array, é proibido', () => {
      for (const to of ['"off"', '"warn"', '["off"]'])
        expect(
          rules(
            'biome.json',
            BIOME,
            edit('"noExplicitAny": "error"', `"noExplicitAny": ${to}`),
          ),
        ).toContain('hard:regra-de-lint-rebaixada-ou-removida');
    });
    it('quando remove a regra em error, é proibido', () => {
      expect(
        rules('biome.json', BIOME, edit('"noExplicitAny": "error",', '')),
      ).toEqual(['hard:regra-de-lint-rebaixada-ou-removida']);
    });
    it('quando desliga o linter (enabled:false) ou remove o enabled, é proibido', () => {
      expect(
        rules('biome.json', BIOME, edit('"enabled": true', '"enabled": false')),
      ).toContain('hard:regra-de-lint-desligada');
      expect(rules('biome.json', BIOME, edit('"enabled": true, ', ''))).toEqual(
        ['hard:regra-de-lint-desligada'],
      );
    });
    it('quando uma regra nova nasce frouxa (caso do #814), pede GATE-ALTERADO e não TESTE-ALTERADO', () => {
      const head = edit(
        '"noExcessiveLinesPerFunction": "off"',
        '"noExcessiveCognitiveComplexity": "off", "noExcessiveLinesPerFunction": "off"',
      );
      expect(rules('biome.json', BIOME, head)).toEqual([
        'justifiable/gate:regra-de-lint-nao-estrita',
      ]);
      const findings = analyzeConfigs([
        { file: 'biome.json', base: BIOME, head },
      ]);
      expect(
        judge(
          findings,
          'TESTE-ALTERADO: motivo de teste com mais de vinte caracteres',
        ).ok,
      ).toBe(false);
      expect(
        judge(
          findings,
          null,
          'motivo da regra de lint com mais de vinte caracteres',
        ).ok,
      ).toBe(true);
    });
    it('quando endurece uma regra ou acrescenta override em error, passa', () => {
      expect(
        rules(
          'biome.json',
          BIOME,
          edit(
            '"noExcessiveLinesPerFunction": "off"',
            '"noExcessiveLinesPerFunction": "error"',
          ),
        ),
      ).toEqual([]);
    });
    it('quando o arquivo é apagado, é proibido', () => {
      expect(rules('biome.json', BIOME, null)).toEqual([
        'hard:config-do-gate-removida',
      ]);
    });
  });

  describe('dado os configs TypeScript de Vitest e Playwright', () => {
    const VITEST = `export default { test: { testTimeout: 20_000, coverage: { thresholds: { lines: 90, branches: 90, 'src/domain/**': { lines: 100 } } } } };`;
    it('quando remove um limiar, é proibido', () => {
      expect(
        rules(
          'vitest.config.mts',
          VITEST,
          VITEST.replace(", 'src/domain/**': { lines: 100 }", ''),
        ),
      ).toEqual(['hard:limiar-de-cobertura-removido']);
      expect(
        rules(
          'vitest.config.mts',
          VITEST,
          VITEST.replace('branches: 90, ', ''),
        ),
      ).toEqual(['hard:limiar-de-cobertura-removido']);
    });
    it('quando o limiar deixa de ser literal (process.env), falha fechado', () => {
      expect(
        rules(
          'vitest.config.mts',
          VITEST,
          VITEST.replace('lines: 90', 'lines: Number(process.env.L)'),
        ),
      ).toEqual(['hard:limiar-de-cobertura-nao-literal']);
    });
    it('quando o limiar cai, é proibido; quando sobe, passa', () => {
      expect(
        rules(
          'vitest.config.mts',
          VITEST,
          VITEST.replace('lines: 90', 'lines: 80'),
        ),
      ).toEqual(['hard:limiar-de-cobertura-reduzido']);
      expect(
        rules(
          'vitest.config.mts',
          VITEST,
          VITEST.replace('lines: 90', 'lines: 95'),
        ),
      ).toEqual([]);
    });
    it('quando o timeout ou o retry sobe, é proibido, também nos configs vitest.mutacao e playwright.console', () => {
      expect(
        rules(
          'vitest.mutacao.config.mts',
          VITEST,
          VITEST.replace('20_000', '40_000'),
        ),
      ).toEqual(['hard:retry-ou-timeout-aumentado']);
      expect(
        rules(
          'playwright.console.config.ts',
          'x { retries: 0 }',
          'x { retries: 2 }',
        ),
      ).toEqual(['hard:retry-ou-timeout-aumentado']);
      expect(
        rules('vitest.config.mts', VITEST, VITEST.replace('20_000', '10_000')),
      ).toEqual([]);
    });
    it('quando o arquivo é apagado ou renomeado, é proibido', () => {
      expect(rules('vitest.config.mts', VITEST, null)).toEqual([
        'hard:config-do-gate-removida',
      ]);
    });
  });

  describe('dado os shards dos workflows', () => {
    const CI =
      '        shard: [1, 2, 3, 4]\n      run: npx vitest --shard=${{ matrix.shard }}/4\n';
    it('quando remove shard da matriz ou diminui o total, é proibido', () => {
      expect(
        rules(
          '.github/workflows/ci.yml',
          CI,
          CI.replace('[1, 2, 3, 4]', '[1, 2, 3]'),
        ),
      ).toEqual(['hard:shard-removido']);
      expect(
        rules('.github/workflows/ci.yml', CI, CI.replace('}}/4', '}}/2')),
      ).toEqual(['hard:shard-removido']);
      expect(rules('.github/workflows/ci.yml', CI, '      run: x\n')).toEqual([
        'hard:shard-removido',
        'hard:shard-removido',
      ]);
    });
    it('quando aumenta os shards, passa', () => {
      expect(
        rules(
          '.github/workflows/ci.yml',
          CI,
          CI.replace('[1, 2, 3, 4]', '[1, 2, 3, 4, 5]'),
        ),
      ).toEqual([]);
    });
  });

  describe('dado valor antigo deixado em comentário', () => {
    it('quando o shard é trocado por um comentário com o valor antigo, é proibido', () => {
      const ci = '        shard: [1, 2, 3, 4]\n';
      expect(
        rules(
          '.github/workflows/ci.yml',
          ci,
          '        # shard: [1, 2, 3, 4]\n        shard: [1]\n',
        ),
      ).toEqual(['hard:shard-removido']);
    });
    it('quando o limiar é comentado (// e /* */), é proibido', () => {
      const base = 'thresholds: { lines: 90,\n branches: 90 }';
      expect(
        rules(
          'vitest.config.mts',
          base,
          'thresholds: {\n // lines: 90,\n branches: 90 }',
        ),
      ).toEqual(['hard:limiar-de-cobertura-removido']);
      expect(
        rules(
          'vitest.config.mts',
          base,
          'thresholds: { /* lines: 90, */ branches: 90 }',
        ),
      ).toEqual(['hard:limiar-de-cobertura-removido']);
    });
    it('quando a limpeza de comentário não é confiável (bloco ou string sem fim), falha fechado', () => {
      const base = 'thresholds: { lines: 90 }';
      expect(
        rules(
          'vitest.config.mts',
          base,
          'thresholds: { lines: 90 } /* sem fim',
        ),
      ).toEqual(['hard:config-do-gate-ilegivel']);
      expect(
        rules(
          'vitest.config.mts',
          base,
          "thresholds: { lines: 90 }; const x = 'aberta",
        ),
      ).toEqual(['hard:config-do-gate-ilegivel']);
    });
    it('quando o texto parecido com comentário está dentro de string, mantém o valor', () => {
      const base = "const u = 'http://x'; thresholds: { lines: 90 }";
      expect(
        rules(
          'vitest.config.mts',
          base,
          "const u = 'http://y'; thresholds: { lines: 90 }",
        ),
      ).toEqual([]);
    });
  });

  describe('dado o corpo do PR', () => {
    it('lê o motivo GATE-ALTERADO com 20+ caracteres, separado do TESTE-ALTERADO', () => {
      const body =
        'GATE-ALTERADO: complexidade cognitiva passa a valer em src/';
      expect(findGateReason(body)).toBe(
        'complexidade cognitiva passa a valer em src/',
      );
      expect(findReason(body)).toBeNull();
      expect(findGateReason('GATE-ALTERADO: curto')).toBeNull();
    });
  });

  it('classifica os arquivos protegidos', () => {
    for (const f of [
      'stryker.config.json',
      'biome.json',
      'vitest.shard.config.mts',
      'playwright.prod.config.ts',
      '.github/workflows/gate-pr.yml',
    ])
      expect(isGatedConfig(f)).toBe(true);
    expect(isGatedConfig('package.json')).toBe(false);
  });
});
