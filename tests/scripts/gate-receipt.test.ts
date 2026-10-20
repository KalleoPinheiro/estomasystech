import { describe, expect, it } from 'vitest';
import {
  formatReceipt,
  REQUIRED_STEPS,
  verifyReceipt,
} from '../../scripts/gate/receipt';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const base = {
  sha: SHA,
  passed: true,
  e2eTests: 254,
  steps: [...REQUIRED_STEPS],
  skipped: [],
  minutes: 14.25,
};

describe('Recibo do gate local no PR', () => {
  it('formata a linha com SHA, resultado, testes, etapas e puladas', () => {
    expect(formatReceipt(base)).toBe(
      `E2E-GATE: ${SHA} pass e2e=254 etapas=${REQUIRED_STEPS.join(',')} puladas=nenhuma min=14.3`,
    );
    expect(
      formatReceipt({ ...base, passed: false, skipped: ['docker'] }),
    ).toContain('fail');
    expect(formatReceipt({ ...base, skipped: ['docker', 'backup'] })).toContain(
      'puladas=docker,backup',
    );
  });

  it('aceita o recibo do commit atual com todas as etapas', () => {
    expect(
      verifyReceipt(`texto\n${formatReceipt(base)}\nmais`, SHA),
    ).toMatchObject({ ok: true });
  });

  it('recusa PR sem recibo, inclusive o campo vazio do template', () => {
    expect(verifyReceipt('sem linha', SHA)).toMatchObject({ ok: false });
    expect(verifyReceipt(`E2E-GATE:\n${SHA} pass etapas=x`, SHA)).toMatchObject(
      { ok: false },
    );
  });

  it('recusa recibo de outro commit (push depois do gate)', () => {
    const check = verifyReceipt(formatReceipt(base), OTHER);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('rode o gate de novo');
  });

  it('recusa recibo de gate que falhou', () => {
    expect(
      verifyReceipt(formatReceipt({ ...base, passed: false }), SHA).ok,
    ).toBe(false);
  });

  it('recusa recibo sem etapa obrigatória e sem lista de etapas', () => {
    const check = verifyReceipt(
      formatReceipt({ ...base, steps: ['typecheck'] }),
      SHA,
    );
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('e2e-producao');
    expect(verifyReceipt(`E2E-GATE: ${SHA} pass sem-campos`, SHA).ok).toBe(
      false,
    );
  });
});
