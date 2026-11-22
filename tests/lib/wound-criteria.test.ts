import { describe, expect, it } from 'vitest';
import {
  EXUDATE_LABELS,
  EXUDATE_TYPE_LABELS,
  INFECTION_LEVEL_LABELS,
  TISSUE_TYPE_LABELS,
  WOUND_EDGE_LABELS,
} from '@/lib/format';
import {
  criterionHint,
  EXUDATE_CRITERIA,
  EXUDATE_TYPE_CRITERIA,
  INFECTION_LEVEL_CRITERIA,
  TISSUE_TYPE_CRITERIA,
  tissuePercentTotal,
  WOUND_EDGE_CRITERIA,
} from '@/lib/wound-criteria';

describe('Feature: critério de cada opção da avaliação de ferida (#955)', () => {
  it.each([
    ['exsudato', EXUDATE_LABELS, EXUDATE_CRITERIA],
    ['tecido', TISSUE_TYPE_LABELS, TISSUE_TYPE_CRITERIA],
    ['infecção', INFECTION_LEVEL_LABELS, INFECTION_LEVEL_CRITERIA],
    ['aspecto da drenagem', EXUDATE_TYPE_LABELS, EXUDATE_TYPE_CRITERIA],
    ['bordas', WOUND_EDGE_LABELS, WOUND_EDGE_CRITERIA],
  ])(
    'Dado o campo %s, Então toda opção da lista tem critério',
    (_campo, labels, criteria) => {
      expect(Object.keys(criteria).sort()).toEqual(Object.keys(labels).sort());
      for (const text of Object.values(criteria)) {
        expect(text.length).toBeGreaterThan(0);
      }
    },
  );

  it('Dado a quantidade de exsudato, Então cada faixa mostra a saturação da cobertura', () => {
    expect(EXUDATE_CRITERIA.low).toContain('Menos de 25%');
    expect(EXUDATE_CRITERIA.moderate).toContain('De 25% a 75%');
    expect(EXUDATE_CRITERIA.high).toContain('Mais de 75%');
  });

  it('Dado infecção sistêmica, Então o critério manda encaminhar na hora', () => {
    expect(INFECTION_LEVEL_CRITERIA.systemic).toContain('encaminhar na hora');
  });

  it('Dado opção escolhida, Então a legenda é o critério dela; sem escolha ou código legado, o texto de convite', () => {
    expect(criterionHint(EXUDATE_CRITERIA, 'low', 'escolha')).toBe(
      EXUDATE_CRITERIA.low,
    );
    expect(criterionHint(EXUDATE_CRITERIA, '', 'escolha')).toBe('escolha');
    expect(criterionHint(TISSUE_TYPE_CRITERIA, 'texto livre', 'escolha')).toBe(
      'escolha',
    );
  });
});

describe('Feature: soma dos percentuais de tecido (#955)', () => {
  it('Dado nenhum percentual preenchido, Então não há soma', () => {
    expect(tissuePercentTotal(['', '', ' ', ''])).toBeNull();
  });

  it('Dado percentuais preenchidos, Então soma só os informados, contando o zero', () => {
    expect(tissuePercentTotal(['60', '0', '', '40'])).toBe(100);
    expect(tissuePercentTotal(['70', '50', '', ''])).toBe(120);
  });

  it('Dado texto que não é número, Então ele fica fora da soma', () => {
    expect(tissuePercentTotal(['abc', '30'])).toBe(30);
    expect(tissuePercentTotal(['abc'])).toBeNull();
  });
});
