import { describe, expect, it } from 'vitest';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { ValidationError } from '@/domain/shared/errors';

const base = { conditionId: 'cond-1' };

describe('Feature: Avaliação da condição (mutação, #406)', () => {
  describe('Cenário: PUSH 3.0, subscore da área (faixas em cm²)', () => {
    // [área em mm² (comprimento × 1 mm), subscore esperado]
    it.each([
      [0, 0],
      [30, 1],
      [31, 2],
      [60, 2],
      [61, 3],
      [100, 3],
      [101, 4],
      [200, 4],
      [201, 5],
      [300, 5],
      [301, 6],
      [400, 6],
      [401, 7],
      [800, 7],
      [801, 8],
      [1200, 8],
      [1201, 9],
      [2400, 9],
      [2401, 10],
    ])(
      'Dado área de %s mm², Quando calculo o PUSH sem exsudato nem tecido, Então o subscore é %s',
      (mm2, score) => {
        const a = ConditionAssessment.create({
          ...base,
          lengthMm: mm2,
          widthMm: 1,
          exudate: 'none',
          tissueType: 'closed',
        });
        expect(a.pushScore).toBe(score);
      },
    );

    it('Dado exsudato e tecido, Quando calculo o PUSH, Então soma os três subscores', () => {
      const a = ConditionAssessment.create({
        ...base,
        lengthMm: 100,
        widthMm: 3,
        exudate: 'high',
        tissueType: 'necrotic',
      });
      expect(a.pushScore).toBe(5 + 3 + 4);
    });

    it('Dado componente ausente ou tecido em texto livre, Então o PUSH é nulo', () => {
      const full = {
        ...base,
        lengthMm: 10,
        widthMm: 10,
        exudate: 'low' as const,
        tissueType: 'slough',
      };
      expect(
        ConditionAssessment.create({ ...full, lengthMm: null }).pushScore,
      ).toBeNull();
      expect(
        ConditionAssessment.create({ ...full, exudate: null }).pushScore,
      ).toBeNull();
      expect(
        ConditionAssessment.create({ ...full, tissueType: null }).pushScore,
      ).toBeNull();
      expect(
        ConditionAssessment.create({ ...full, tissueType: 'tecido legado' })
          .pushScore,
      ).toBeNull();
    });
  });

  describe('Cenário: área estimada', () => {
    it('Dado só comprimento ou só largura, Então a área é nula; com os dois, é o produto', () => {
      expect(
        ConditionAssessment.create({ ...base, lengthMm: 10 }).areaMm2,
      ).toBeNull();
      expect(
        ConditionAssessment.create({ ...base, widthMm: 10 }).areaMm2,
      ).toBeNull();
      expect(
        ConditionAssessment.create({ ...base, lengthMm: 10, widthMm: 4 })
          .areaMm2,
      ).toBe(40);
    });
  });

  describe('Cenário: validação', () => {
    it.each([
      ['comprimento', { lengthMm: -1 }],
      ['largura', { widthMm: -1 }],
      ['profundidade', { depthMm: -1 }],
    ])('Dado %s negativa, Então rejeita nomeando a medida', (label, patch) => {
      expect(() => ConditionAssessment.create({ ...base, ...patch })).toThrow(
        `Medida de ${label} não pode ser negativa`,
      );
    });

    it('Dado medida zero, Então aceita', () => {
      expect(() =>
        ConditionAssessment.create({
          ...base,
          lengthMm: 0,
          widthMm: 0,
          depthMm: 0,
        }),
      ).not.toThrow();
    });

    it('Dado dor nos limites, Então aceita 0 e 10 e rejeita fora deles', () => {
      expect(
        ConditionAssessment.create({ ...base, painScale: 0 }).painScale,
      ).toBe(0);
      expect(
        ConditionAssessment.create({ ...base, painScale: 10 }).painScale,
      ).toBe(10);
      expect(() =>
        ConditionAssessment.create({ ...base, painScale: -1 }),
      ).toThrow('Escala de dor deve estar entre 0 e 10');
      expect(() =>
        ConditionAssessment.create({ ...base, painScale: 11 }),
      ).toThrow('Escala de dor deve estar entre 0 e 10');
    });

    it('Dado condição vazia, Então rejeita', () => {
      expect(() => ConditionAssessment.create({ conditionId: '  ' })).toThrow(
        'Condição é obrigatória',
      );
    });

    it.each([
      'detDiscolorationArea',
      'detErosionArea',
      'detOvergrowthArea',
    ] as const)(
      'Dado %s, Então aceita 0 a 3 inteiros e rejeita o resto',
      (field) => {
        expect(() =>
          ConditionAssessment.create({ ...base, [field]: 0 }),
        ).not.toThrow();
        expect(() =>
          ConditionAssessment.create({ ...base, [field]: 3 }),
        ).not.toThrow();
        for (const bad of [-1, 4, 1.5]) {
          expect(() =>
            ConditionAssessment.create({ ...base, [field]: bad }),
          ).toThrow('DET: área deve ser 0–3 e severidade 0–2');
        }
      },
    );

    it.each([
      'detDiscolorationSeverity',
      'detErosionSeverity',
      'detOvergrowthSeverity',
    ] as const)(
      'Dado %s, Então aceita 0 a 2 inteiros e rejeita o resto',
      (field) => {
        expect(() =>
          ConditionAssessment.create({ ...base, [field]: 0 }),
        ).not.toThrow();
        expect(() =>
          ConditionAssessment.create({ ...base, [field]: 2 }),
        ).not.toThrow();
        for (const bad of [-1, 3, 0.5]) {
          expect(() =>
            ConditionAssessment.create({ ...base, [field]: bad }),
          ).toThrow(ValidationError);
        }
      },
    );

    it('Dado complicações fora da lista, Então rejeita listando as inválidas', () => {
      expect(() =>
        ConditionAssessment.create({
          ...base,
          complicationCodes: 'dermatitis, foo ,bar',
        }),
      ).toThrow('Complicações inválidas: foo, bar');
    });

    it('Dado complicações só com espaços, Então ignora', () => {
      expect(
        ConditionAssessment.create({ ...base, complicationCodes: '   ' })
          .complicationCodes,
      ).toEqual([]);
    });
  });

  describe('Cenário: DET', () => {
    const det = {
      detDiscolorationArea: 1,
      detDiscolorationSeverity: 2,
      detErosionArea: 3,
      detErosionSeverity: 1,
      detOvergrowthArea: 0,
      detOvergrowthSeverity: 2,
    };

    it('Dado os três domínios, Então soma área e severidade de todos', () => {
      expect(ConditionAssessment.create({ ...base, ...det }).detScore).toBe(9);
    });

    it.each(Object.keys(det))(
      'Dado %s ausente, Então o DET é nulo',
      (field) => {
        expect(
          ConditionAssessment.create({ ...base, ...det, [field]: null })
            .detScore,
        ).toBeNull();
      },
    );
  });

  describe('Cenário: leitura dos campos', () => {
    it('Dado avaliação completa, Então os getters devolvem o que foi guardado, com texto aparado', () => {
      const a = ConditionAssessment.create({
        ...base,
        lengthMm: 10,
        widthMm: 20,
        depthMm: 3,
        tissueType: ' granulation ',
        exudate: 'moderate',
        painScale: 4,
        skinCondition: ' íntegra ',
        complications: ' nenhuma ',
        complicationCodes: ' dermatitis , hernia ',
        detDiscolorationArea: 1,
        detDiscolorationSeverity: 1,
        detErosionArea: 2,
        detErosionSeverity: 2,
        detOvergrowthArea: 3,
        detOvergrowthSeverity: 0,
        notes: ' obs ',
      });
      expect(a.conditionId).toBe('cond-1');
      expect(a.lengthMm).toBe(10);
      expect(a.widthMm).toBe(20);
      expect(a.depthMm).toBe(3);
      expect(a.tissueType).toBe('granulation');
      expect(a.exudate).toBe('moderate');
      expect(a.painScale).toBe(4);
      expect(a.skinCondition).toBe('íntegra');
      expect(a.complications).toBe('nenhuma');
      expect(a.complicationCodes).toEqual(['dermatitis', 'hernia']);
      expect([a.detDiscolorationArea, a.detDiscolorationSeverity]).toEqual([
        1, 1,
      ]);
      expect([a.detErosionArea, a.detErosionSeverity]).toEqual([2, 2]);
      expect([a.detOvergrowthArea, a.detOvergrowthSeverity]).toEqual([3, 0]);
      expect(a.notes).toBe('obs');
    });

    it('Dado avaliação só com a condição, Então tudo o mais é nulo', () => {
      const a = ConditionAssessment.create(base);
      expect(a.lengthMm).toBeNull();
      expect(a.widthMm).toBeNull();
      expect(a.depthMm).toBeNull();
      expect(a.tissueType).toBeNull();
      expect(a.exudate).toBeNull();
      expect(a.painScale).toBeNull();
      expect(a.skinCondition).toBeNull();
      expect(a.complications).toBeNull();
      expect(a.complicationCodes).toEqual([]);
      expect(a.detDiscolorationArea).toBeNull();
      expect(a.detErosionSeverity).toBeNull();
      expect(a.notes).toBeNull();
    });

    it('Dado estado restaurado sem os campos opcionais, Então os getters devolvem nulo', () => {
      const a = ConditionAssessment.restore({
        id: 'a1',
        conditionId: 'c1',
        createdAt: new Date(0),
      });
      expect(a.lengthMm).toBeNull();
      expect(a.widthMm).toBeNull();
      expect(a.depthMm).toBeNull();
      expect(a.tissueType).toBeNull();
      expect(a.exudate).toBeNull();
      expect(a.painScale).toBeNull();
      expect(a.skinCondition).toBeNull();
      expect(a.complications).toBeNull();
      expect(a.complicationCodes).toEqual([]);
      expect(a.detDiscolorationArea).toBeNull();
      expect(a.detDiscolorationSeverity).toBeNull();
      expect(a.detErosionArea).toBeNull();
      expect(a.detErosionSeverity).toBeNull();
      expect(a.detOvergrowthArea).toBeNull();
      expect(a.detOvergrowthSeverity).toBeNull();
      expect(a.notes).toBeNull();
    });
  });
});
