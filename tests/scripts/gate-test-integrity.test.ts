import { describe, expect, it } from 'vitest';
import {
  analyzeDiff,
  analyzeEdit,
  findReason,
  isConfigFile,
  isGateFile,
  isSettingFile,
  isTestFile,
  judge,
} from '../../scripts/gate/test-integrity';

/** Monta um diff unificado mínimo para um arquivo. */
function diffOf(
  file: string,
  removed: string[],
  added: string[],
  extra = '',
): string {
  return [
    `diff --git a/${file} b/${file}`,
    extra,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1,1 +1,1 @@',
    ...removed.map((l) => `-${l}`),
    ...added.map((l) => `+${l}`),
  ].join('\n');
}

describe('Regra 8: teste não se edita para resolver problema de desenvolvimento', () => {
  describe('classificação de caminhos', () => {
    it('reconhece teste, config de teste e arquivos do gate', () => {
      expect(isTestFile('tests/domain/x.test.ts')).toBe(true);
      expect(isTestFile('e2e/agenda.spec.ts')).toBe(true);
      expect(isTestFile('src/domain/x.ts')).toBe(false);
      expect(isConfigFile('vitest.config.mts')).toBe(true);
      expect(isConfigFile('playwright.prod.config.ts')).toBe(true);
      expect(isGateFile('scripts/gate/local.ts')).toBe(true);
      expect(isGateFile('.husky/pre-push')).toBe(true);
      expect(isGateFile('.claude/hooks/protect-tests.sh')).toBe(true);
      expect(isGateFile('src/app/page.tsx')).toBe(false);
      expect(isSettingFile('biome.json')).toBe(true);
      expect(isSettingFile('stryker.config.json')).toBe(true);
      expect(isSettingFile('.github/workflows/ci.yml')).toBe(true);
      expect(isSettingFile('package.json')).toBe(false);
    });
  });

  describe('dado um diff de teste', () => {
    it('aceita só acréscimo de teste novo', () => {
      const diff = diffOf(
        'tests/domain/x.test.ts',
        [],
        ["it('novo cenário', () => {});"],
      );
      expect(analyzeDiff(diff)).toEqual([]);
    });

    it('exige motivo quando uma asserção é removida ou alterada', () => {
      const diff = diffOf(
        'tests/domain/x.test.ts',
        ['    expect(total).toBe(10);'],
        ['    expect(total).toBe(11);'],
      );
      const findings = analyzeDiff(diff);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        rule: 'asserção-removida-ou-alterada',
        severity: 'justifiable',
      });
    });

    it('proíbe desligar teste, mesmo com motivo', () => {
      for (const line of [
        "it.skip('x', () => {});",
        "test.fixme('x', () => {});",
        "describe.only('x', () => {});",
        "xit('x', () => {});",
      ]) {
        const findings = analyzeDiff(diffOf('e2e/a.spec.ts', [], [line]));
        expect(findings.map((f) => f.severity)).toEqual(['hard']);
      }
    });

    it('exige motivo quando um arquivo de teste é apagado', () => {
      const diff = `diff --git a/tests/x.test.ts b/tests/x.test.ts\ndeleted file mode 100644\n--- a/tests/x.test.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-expect(1).toBe(1);`;
      expect(analyzeDiff(diff)).toEqual([
        {
          file: 'tests/x.test.ts',
          rule: 'arquivo-de-teste-removido',
          severity: 'justifiable',
          line: 'tests/x.test.ts',
        },
      ]);
    });

    it('não confunde texto de fixture com teste desligado', () => {
      expect(
        analyzeDiff(
          diffOf('tests/x.test.ts', [], ['const linha = "it.skip(\'x\')";']),
        ),
      ).toEqual([]);
    });

    it('ignora arquivo que não é teste nem config', () => {
      expect(
        analyzeDiff(diffOf('src/domain/x.ts', ['expect(1)'], ['expect(2)'])),
      ).toEqual([]);
      expect(analyzeDiff('linha solta antes de qualquer diff')).toEqual([]);
    });
  });

  describe('dado um diff de configuração de teste', () => {
    it('proíbe reduzir o limiar de cobertura', () => {
      const diff = diffOf(
        'vitest.config.mts',
        ['        lines: 90,'],
        ['        lines: 80,'],
      );
      expect(analyzeDiff(diff)).toMatchObject([
        { rule: 'limiar-de-cobertura-reduzido', severity: 'hard' },
      ]);
    });

    it('aceita subir o limiar, mas pede motivo por ser mudança de config', () => {
      const diff = diffOf(
        'vitest.config.mts',
        ['        lines: 90,'],
        ['        lines: 100,'],
      );
      expect(analyzeDiff(diff)).toMatchObject([
        { rule: 'config-de-teste-alterada', severity: 'justifiable' },
      ]);
    });

    it('proíbe aumentar retries e timeouts', () => {
      expect(
        analyzeDiff(
          diffOf('playwright.config.ts', ['  retries: 1,'], ['  retries: 3,']),
        ),
      ).toMatchObject([
        { rule: 'retry-ou-timeout-aumentado', severity: 'hard' },
      ]);
      expect(
        analyzeDiff(
          diffOf(
            'playwright.config.ts',
            ['  timeout: 60_000,'],
            ['  timeout: 120_000,'],
          ),
        ),
      ).toMatchObject([{ severity: 'hard' }]);
      expect(
        analyzeDiff(
          diffOf(
            'playwright.config.ts',
            ['  expect: { timeout: 10_000 },'],
            ['  expect: { timeout: 30_000 },'],
          ),
        ),
      ).toMatchObject([{ severity: 'hard' }]);
      expect(
        analyzeDiff(diffOf('playwright.config.ts', [], ['  retries: 2,'])),
      ).toMatchObject([{ severity: 'hard' }]);
    });

    it('permite reduzir retry ou timeout, pedindo motivo', () => {
      expect(
        analyzeDiff(
          diffOf(
            'playwright.prod.config.ts',
            ['  retries: 1,'],
            ['  retries: 0,'],
          ),
        ),
      ).toMatchObject([{ severity: 'justifiable' }]);
    });
  });

  describe('dado uma edição do agente antes de gravar', () => {
    it('libera teste novo e arquivo comum', () => {
      expect(
        analyzeEdit({
          filePath: 'tests/novo.test.ts',
          exists: false,
          content: "it.skip('x')",
        }),
      ).toEqual([]);
      expect(
        analyzeEdit({
          filePath: 'src/domain/x.ts',
          exists: true,
          oldString: 'expect(1)',
          newString: 'b',
        }),
      ).toEqual([]);
    });

    it('libera acréscimo num teste existente', () => {
      expect(
        analyzeEdit({
          filePath: 'tests/x.test.ts',
          exists: true,
          oldString: '});',
          newString: "});\n\nit('novo', () => {});",
        }),
      ).toEqual([]);
    });

    it('bloqueia trocar uma asserção existente', () => {
      expect(
        analyzeEdit({
          filePath: 'tests/x.test.ts',
          exists: true,
          oldString: 'expect(a).toBe(1);',
          newString: 'expect(a).toBe(2);',
        }),
      ).toMatchObject([
        { rule: 'asserção-removida-ou-alterada', severity: 'hard' },
      ]);
    });

    it('bloqueia desligar teste e reescrever arquivo de teste inteiro', () => {
      expect(
        analyzeEdit({
          filePath: 'tests/x.test.ts',
          exists: true,
          oldString: 'a',
          newString: "it.skip('x')",
        }),
      ).toMatchObject([{ rule: 'teste-desligado' }]);
      expect(
        analyzeEdit({
          filePath: 'tests/x.test.ts',
          exists: true,
          content: 'novo',
        }),
      ).toMatchObject([{ rule: 'reescrita-integral-de-teste-existente' }]);
    });

    it('bloqueia config de teste e arquivos do gate', () => {
      expect(
        analyzeEdit({
          filePath: 'vitest.config.mts',
          exists: true,
          oldString: 'a',
          newString: 'b',
        }),
      ).toMatchObject([
        { rule: 'config-de-teste-protegida', severity: 'hard' },
      ]);
      expect(
        analyzeEdit({
          filePath: 'scripts/gate/local.ts',
          exists: true,
          oldString: 'a',
          newString: 'b',
        }),
      ).toMatchObject([{ rule: 'arquivo-do-gate-protegido' }]);
    });
  });

  describe('dado o corpo do PR', () => {
    it('lê o motivo de negócio com 20+ caracteres', () => {
      expect(
        findReason('x\nTESTE-ALTERADO: regra de repasse mudou em 2026-10'),
      ).toBe('regra de repasse mudou em 2026-10');
      expect(findReason('TESTE-ALTERADO: curto')).toBeNull();
      expect(findReason('sem marcador')).toBeNull();
      // marcador vazio do template não pode capturar a linha seguinte
      expect(
        findReason(
          'TESTE-ALTERADO:\ntexto da linha seguinte com mais de vinte caracteres',
        ),
      ).toBeNull();
    });

    it('aprova sem achados e reprova com achado proibido', () => {
      expect(judge([], null)).toEqual({ ok: true, messages: [] });
      const hard = analyzeDiff(diffOf('e2e/a.spec.ts', [], ["test.skip('x')"]));
      expect(judge(hard, 'motivo de negócio qualquer com tamanho').ok).toBe(
        false,
      );
    });

    it('aprova achado justificável só com motivo', () => {
      const soft = analyzeDiff(
        diffOf('tests/x.test.ts', ['expect(1)'], ['expect(2)']),
      );
      expect(judge(soft, null).ok).toBe(false);
      expect(judge(soft, null).messages.at(-1)).toContain('TESTE-ALTERADO');
      expect(
        judge(soft, 'regra de negócio mudou conforme decisão do dono').ok,
      ).toBe(true);
    });
  });
});

describe('Regra 8: configurações que afrouxam o gate (#732)', () => {
  const rules = (file: string, removed: string[], added: string[]) =>
    analyzeDiff(diffOf(file, removed, added)).map(
      (f) => `${f.severity}:${f.rule}`,
    );

  describe('dado o limiar de mutação do Stryker', () => {
    it('proíbe baixar o limiar break', () => {
      expect(
        rules('stryker.config.json', ['  "break": 85'], ['  "break": 70']),
      ).toEqual(['hard:limiar-de-mutacao-reduzido']);
    });
    it('lê o limiar break na linha real do thresholds', () => {
      expect(
        rules(
          'stryker.config.json',
          ['  "thresholds": { "high": 90, "low": 70, "break": 85 }'],
          ['  "thresholds": { "high": 90, "low": 70, "break": 80 }'],
        ),
      ).toEqual(['hard:limiar-de-mutacao-reduzido']);
    });
    it('proíbe aumentar o timeout da mutação', () => {
      expect(
        rules(
          'stryker.config.json',
          ['  "timeoutMS": 60000,'],
          ['  "timeoutMS": 90000,'],
        ),
      ).toEqual(['hard:retry-ou-timeout-aumentado']);
    });
    it('proíbe tirar arquivo da lista mutate ou excluir com "!"', () => {
      expect(
        rules('stryker.config.json', ['    "src/domain/**/*.ts",'], []),
      ).toEqual(['hard:mutacao-escopo-reduzido']);
      expect(
        rules('stryker.config.json', [], ['    "!src/domain/billing/**",']),
      ).toEqual(['hard:mutacao-escopo-reduzido']);
    });
    it('aceita ampliar a lista mutate', () => {
      expect(
        rules('stryker.config.json', [], ['    "src/lib/**/*.ts",']),
      ).toEqual([]);
    });
  });

  describe('dado o biome.json', () => {
    it('proíbe rebaixar regra de error para warn ou off', () => {
      expect(
        rules(
          'biome.json',
          ['  "noExplicitAny": "error"'],
          ['  "noExplicitAny": "off"'],
        ),
      ).toEqual(['hard:regra-de-lint-rebaixada']);
      expect(
        rules('biome.json', ['  "level": "error"'], ['  "level": "warn"']),
      ).toEqual(['hard:regra-de-lint-rebaixada']);
    });
    it('pede motivo para regra nova que nasce frouxa e aceita subir para error', () => {
      expect(rules('biome.json', [], ['  "noFoo": "warn"'])).toEqual([
        'justifiable:regra-de-lint-nao-estrita',
      ]);
      expect(
        rules('biome.json', ['  "noFoo": "warn"'], ['  "noFoo": "error"']),
      ).toEqual([]);
    });
  });

  describe('dado os configs de Vitest e Playwright', () => {
    it('trata vitest.integracao, vitest.mutacao e playwright.console como config de teste', () => {
      for (const f of [
        'vitest.integracao.config.mts',
        'vitest.mutacao.config.mts',
        'vitest.shard.config.mts',
        'playwright.console.config.ts',
      ])
        expect(isConfigFile(f)).toBe(true);
      expect(
        rules(
          'vitest.mutacao.config.mts',
          ['    testTimeout: 20_000,'],
          ['    testTimeout: 40_000,'],
        ),
      ).toEqual(['hard:retry-ou-timeout-aumentado']);
      expect(
        rules(
          'playwright.console.config.ts',
          ['  retries: 0,'],
          ['  retries: 2,'],
        ),
      ).toEqual(['hard:retry-ou-timeout-aumentado']);
    });
  });

  describe('dado os shards dos workflows', () => {
    it('proíbe remover shard da matriz ou diminuir o total do --shard', () => {
      expect(
        rules(
          '.github/workflows/ci.yml',
          ['        shard: [1, 2, 3, 4]'],
          ['        shard: [1, 2, 3]'],
        ),
      ).toEqual(['hard:shard-removido']);
      expect(
        rules(
          '.github/workflows/gate-pr.yml',
          ['          --shard=1/3'],
          ['          --shard=1/2'],
        ),
      ).toEqual(['hard:shard-removido']);
      expect(
        rules('.github/workflows/ci.yml', ['        shard: [1, 2, 3, 4]'], []),
      ).toEqual(['hard:shard-removido']);
    });
    it('aceita aumentar os shards e ignora outros workflows', () => {
      expect(
        rules(
          '.github/workflows/ci.yml',
          ['        shard: [1, 2, 3, 4]'],
          ['        shard: [1, 2, 3, 4, 5]'],
        ),
      ).toEqual([]);
      expect(
        rules('.github/workflows/outro.yml', ['shard: [1, 2]'], []),
      ).toEqual([]);
    });
  });

  it('o hook não bloqueia a edição de biome.json nem de stryker.config.json (só o diff é julgado)', () => {
    expect(
      analyzeEdit({
        filePath: 'biome.json',
        exists: true,
        oldString: 'a',
        newString: 'b',
      }),
    ).toEqual([]);
    expect(
      analyzeEdit({
        filePath: 'stryker.config.json',
        exists: true,
        oldString: 'a',
        newString: 'b',
      }),
    ).toEqual([]);
  });
});
