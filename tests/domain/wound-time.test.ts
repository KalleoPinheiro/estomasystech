import { describe, expect, it } from 'vitest';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import {
  EXUDATE_TYPES,
  INFECTION_LEVELS,
  INFECTION_SIGNS,
  validateWoundTime,
  WOUND_EDGES,
} from '@/domain/clinical/wound-time';
import { ValidationError } from '@/domain/shared/errors';

const base = { conditionId: 'c1' };

describe('Feature: TIME completo na avaliação de ferida (#464)', () => {
  describe('Cenário: Infecção/Inflamação', () => {
    it('Dado nível e sinais válidos, Quando criar, Então guarda nível e lista de sinais', () => {
      const assessment = ConditionAssessment.create({
        ...base,
        infectionLevel: 'local',
        infectionSigns: ' erythema, heat ,malodor ',
      });

      expect(assessment.infectionLevel).toBe('local');
      expect(assessment.infectionSigns).toEqual([
        'erythema',
        'heat',
        'malodor',
      ]);
    });

    it.each(INFECTION_LEVELS)(
      'Dado o nível %s, Quando criar, Então aceita',
      (level) => {
        expect(
          ConditionAssessment.create({ ...base, infectionLevel: level })
            .infectionLevel,
        ).toBe(level);
      },
    );

    it.each(INFECTION_SIGNS)(
      'Dado o sinal %s, Quando criar, Então aceita',
      (sign) => {
        expect(
          ConditionAssessment.create({ ...base, infectionSigns: sign })
            .infectionSigns,
        ).toEqual([sign]);
      },
    );

    it('Dado nível desconhecido, Quando criar, Então recusa com o valor informado', () => {
      expect(() =>
        ConditionAssessment.create({ ...base, infectionLevel: 'grave' }),
      ).toThrow(new ValidationError('Nível de infecção inválido: grave'));
    });

    it('Dado sinal desconhecido, Quando criar, Então recusa listando os inválidos', () => {
      expect(() =>
        ConditionAssessment.create({
          ...base,
          infectionSigns: 'erythema,tosse,coceira',
        }),
      ).toThrow('Sinais de infecção inválidos: tosse, coceira');
    });

    it('Dado sinais em branco, Quando criar, Então não há sinais', () => {
      const assessment = ConditionAssessment.create({
        ...base,
        infectionSigns: '   ',
      });

      expect(assessment.infectionSigns).toEqual([]);
    });
  });

  describe('Cenário: Bordas e exsudato', () => {
    it.each(WOUND_EDGES)(
      'Dado a borda %s, Quando criar, Então aceita',
      (edge) => {
        expect(
          ConditionAssessment.create({ ...base, woundEdges: edge }).woundEdges,
        ).toBe(edge);
      },
    );

    it('Dado borda desconhecida, Quando criar, Então recusa', () => {
      expect(() =>
        ConditionAssessment.create({ ...base, woundEdges: 'lisas' }),
      ).toThrow('Bordas inválido: lisas');
    });

    it.each(EXUDATE_TYPES)(
      'Dado o tipo de exsudato %s, Quando criar, Então aceita',
      (type) => {
        expect(
          ConditionAssessment.create({ ...base, exudateType: type })
            .exudateType,
        ).toBe(type);
      },
    );

    it('Dado tipo de exsudato desconhecido, Quando criar, Então recusa', () => {
      expect(() =>
        ConditionAssessment.create({ ...base, exudateType: 'verde' }),
      ).toThrow('Tipo de exsudato inválido: verde');
    });
  });

  describe('Cenário: percentual de tecido', () => {
    it('Dado percentuais que somam exatamente 100, Quando criar, Então aceita', () => {
      const assessment = ConditionAssessment.create({
        ...base,
        granulationPct: 50,
        epithelialPct: 10,
        sloughPct: 30,
        necroticPct: 10,
      });

      expect(assessment.granulationPct).toBe(50);
      expect(assessment.epithelialPct).toBe(10);
      expect(assessment.sloughPct).toBe(30);
      expect(assessment.necroticPct).toBe(10);
    });

    it('Dado percentuais que somam 101, Quando criar, Então recusa', () => {
      expect(() =>
        ConditionAssessment.create({
          ...base,
          granulationPct: 60,
          sloughPct: 41,
        }),
      ).toThrow('A soma dos percentuais de tecido não pode passar de 100%');
    });

    it.each([
      ['granulationPct', -1],
      ['epithelialPct', 101],
      ['sloughPct', 12.5],
      ['necroticPct', -10],
    ])('Dado %s = %s, Quando criar, Então recusa', (field, value) => {
      expect(() =>
        ConditionAssessment.create({ ...base, [field]: value }),
      ).toThrow('Percentual de tecido deve ser inteiro de 0 a 100');
    });

    it('Dado 0% e 100% nos extremos, Quando criar, Então aceita', () => {
      expect(
        ConditionAssessment.create({ ...base, necroticPct: 100 }).necroticPct,
      ).toBe(100);
      expect(
        ConditionAssessment.create({ ...base, necroticPct: 0 }).necroticPct,
      ).toBe(0);
    });
  });

  describe('Cenário: avaliação anterior ao TIME completo', () => {
    it('Dado avaliação sem os campos novos, Quando criar, Então tudo é nulo ou vazio e o PUSH segue', () => {
      const assessment = ConditionAssessment.create({
        ...base,
        lengthMm: 20,
        widthMm: 10,
        exudate: 'low',
        tissueType: 'granulation',
      });

      expect(assessment.infectionLevel).toBeNull();
      expect(assessment.infectionSigns).toEqual([]);
      expect(assessment.woundEdges).toBeNull();
      expect(assessment.exudateType).toBeNull();
      expect(assessment.granulationPct).toBeNull();
      expect(assessment.epithelialPct).toBeNull();
      expect(assessment.sloughPct).toBeNull();
      expect(assessment.necroticPct).toBeNull();
      expect(assessment.pushScore).toBe(7);
    });

    it('Dado linha antiga restaurada sem os campos novos, Quando ler, Então não quebra', () => {
      const restored = ConditionAssessment.restore({
        id: 'a1',
        conditionId: 'c1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      expect(restored.infectionLevel).toBeNull();
      expect(restored.infectionSigns).toEqual([]);
      expect(restored.woundEdges).toBeNull();
      expect(restored.exudateType).toBeNull();
      expect(restored.granulationPct).toBeNull();
    });
  });

  it('Dado props vazias, Quando validar o TIME, Então não lança', () => {
    expect(() => validateWoundTime({})).not.toThrow();
  });
});
