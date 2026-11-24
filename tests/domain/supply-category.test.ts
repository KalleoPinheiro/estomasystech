import { describe, expect, it } from 'vitest';
import {
  parseSupplyCategory,
  SUPPLY_CATEGORIES,
  SUPPLY_CATEGORY_INVALID_MESSAGE,
  SUPPLY_CATEGORY_LABELS,
  Supply,
  type SupplyCategory,
} from '@/domain/inventory/supply';

const base = { name: 'Hidrocoloide', unit: 'un', minQty: 0, priceCents: 1000 };

describe('Feature: categoria do insumo (#963 D2)', () => {
  it('insumo sem categoria nasce com categoria null', () => {
    expect(Supply.create(base).category).toBeNull();
    expect(Supply.create({ ...base, category: null }).category).toBeNull();
  });

  it.each(SUPPLY_CATEGORIES)('aceita a categoria %s', (category) => {
    expect(Supply.create({ ...base, category }).category).toBe(category);
  });

  it('recusa categoria fora da lista', () => {
    expect(() =>
      Supply.create({ ...base, category: 'curativo' as SupplyCategory }),
    ).toThrow(SUPPLY_CATEGORY_INVALID_MESSAGE);
  });

  it('update troca, mantém e limpa a categoria', () => {
    const supply = Supply.create({ ...base, category: 'cobertura' });
    expect(supply.update({ name: 'Outro nome' }).category).toBe('cobertura');
    expect(supply.update({ category: 'solucao' }).category).toBe('solucao');
    expect(supply.update({ category: null }).category).toBeNull();
  });

  it('restore de estado antigo sem categoria devolve null', () => {
    const supply = Supply.restore({
      ...base,
      id: 's1',
      stockQty: 0,
      active: true,
      createdAt: new Date(),
    });
    expect(supply.category).toBeNull();
  });

  it('parseSupplyCategory aceita só valores conhecidos', () => {
    expect(parseSupplyCategory('protecao')).toBe('protecao');
    expect(parseSupplyCategory('desconhecida')).toBeNull();
    expect(parseSupplyCategory(null)).toBeNull();
  });

  it('toda categoria tem rótulo', () => {
    expect(SUPPLY_CATEGORIES.map((c) => SUPPLY_CATEGORY_LABELS[c])).toEqual([
      'Cobertura',
      'Solução',
      'Proteção',
      'Outro',
    ]);
  });
});
