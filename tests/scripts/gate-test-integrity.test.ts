import { describe, expect, it } from 'vitest';
import {
  analyzeDiff,
  analyzeEdit,
  findReason,
  isConfigFile,
  isGateFile,
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
