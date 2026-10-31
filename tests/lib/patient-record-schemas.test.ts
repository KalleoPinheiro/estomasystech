import { describe, expect, it } from 'vitest';
import { diagnosisSchema } from '@/lib/patient-record-schemas';

const check = (body: Record<string, unknown>) =>
  diagnosisSchema.safeParse({ diagnosisCode: '00046', ...body });

const messages = (body: Record<string, unknown>) => {
  const result = check(body);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe('Feature: regras PES do diagnóstico de enfermagem na entrada (#552)', () => {
  it('Dado um diagnóstico de risco, Quando falta o fator relacionado, Então é recusado', () => {
    expect(messages({ type: 'risco' })).toContain(
      'Fator relacionado é obrigatório para este tipo de diagnóstico',
    );
  });

  it('Dado um diagnóstico de risco, Quando traz característica definidora, Então é recusado', () => {
    expect(
      messages({
        type: 'risco',
        relatedFactors: 'Umidade',
        definingCharacteristics: 'Dor',
      }),
    ).toContain('Diagnóstico de risco não tem características definidoras');
  });

  it('Dado um diagnóstico real, Quando faltam fator e característica, Então os dois erros aparecem', () => {
    expect(messages({ type: 'real' })).toEqual([
      'Fator relacionado é obrigatório para este tipo de diagnóstico',
      'Característica definidora é obrigatória para este tipo de diagnóstico',
    ]);
  });

  it('Dado um diagnóstico de promoção da saúde, Quando traz fator relacionado e falta característica, Então os dois erros aparecem', () => {
    expect(
      messages({ type: 'promocao-saude', relatedFactors: 'Motivação' }),
    ).toEqual([
      'Diagnóstico de promoção da saúde não tem fatores relacionados',
      'Característica definidora é obrigatória para este tipo de diagnóstico',
    ]);
  });

  it.each([
    ['risco', { relatedFactors: 'Umidade' }],
    ['real', { relatedFactors: 'Umidade', definingCharacteristics: 'Dor' }],
    ['promocao-saude', { definingCharacteristics: 'Disposição' }],
  ])(
    'Dado o diagnóstico %s completo, Quando valida, Então passa',
    (type, rest) => {
      expect(check({ type, ...rest }).success).toBe(true);
    },
  );
});
