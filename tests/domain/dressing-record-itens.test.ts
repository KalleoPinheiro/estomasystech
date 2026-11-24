import { describe, expect, it } from 'vitest';
import {
  DRESSING_ITEM_DUPLICATE_MESSAGE,
  DRESSING_ITEM_QUANTITY_INVALID_MESSAGE,
  DRESSING_ITEM_QUANTITY_MAX,
  DRESSING_ITEM_ROLE_INVALID_MESSAGE,
  DRESSING_ITEM_ROLE_LABELS,
  DRESSING_ITEM_ROLES,
  DRESSING_ITEM_SUPPLY_REQUIRED_MESSAGE,
  DRESSING_ITEMS_MAX,
  DRESSING_ITEMS_TOO_MANY_MESSAGE,
  type DressingContent,
  type DressingItem,
  type DressingItemRole,
  DressingRecord,
} from '@/domain/clinical/dressing-record';

const content: DressingContent = {
  painBefore: null,
  removal: null,
  cleansingMethod: null,
  cleansingSolution: 'Soro',
  debridementType: null,
  debridementResult: null,
  adjuvantTherapy: null,
  periwoundProtection: null,
  primaryCover: 'Alginato',
  secondaryCover: null,
  fixation: null,
  guidance: null,
  painAfter: null,
  nextChangeOn: '2026-12-01',
};

const create = (items?: DressingItem[]) =>
  DressingRecord.create({
    patientId: 'p-1',
    appointmentId: 'a-1',
    content,
    items,
  });

describe('Feature: insumos usados no curativo (#963, T2)', () => {
  it('Dado itens de várias etapas, Quando cria, Então guarda na ordem, com o insumo sem espaços', () => {
    const record = create([
      { role: 'solucao', supplyId: ' soro ', quantity: 1 },
      { role: 'cobertura_primaria', supplyId: 'alginato', quantity: 2 },
      { role: 'fixacao', supplyId: 'fita', quantity: 1 },
    ]);

    expect(record.items).toEqual([
      { role: 'solucao', supplyId: 'soro', quantity: 1 },
      { role: 'cobertura_primaria', supplyId: 'alginato', quantity: 2 },
      { role: 'fixacao', supplyId: 'fita', quantity: 1 },
    ]);
  });

  it('Dado curativo sem itens, Quando cria, Então a lista é vazia', () => {
    expect(create().items).toEqual([]);
  });

  it('Dado o mesmo insumo em etapas diferentes, Quando cria, Então aceita', () => {
    const record = create([
      { role: 'cobertura_primaria', supplyId: 'gaze', quantity: 1 },
      { role: 'cobertura_secundaria', supplyId: 'gaze', quantity: 3 },
    ]);

    expect(record.items).toHaveLength(2);
  });

  it.each([
    [
      { role: 'curativo' as DressingItemRole, supplyId: 's', quantity: 1 },
      DRESSING_ITEM_ROLE_INVALID_MESSAGE,
    ],
    [
      { role: 'solucao' as const, supplyId: '  ', quantity: 1 },
      DRESSING_ITEM_SUPPLY_REQUIRED_MESSAGE,
    ],
    [
      { role: 'solucao' as const, supplyId: 's', quantity: 0 },
      DRESSING_ITEM_QUANTITY_INVALID_MESSAGE,
    ],
    [
      { role: 'solucao' as const, supplyId: 's', quantity: 1.5 },
      DRESSING_ITEM_QUANTITY_INVALID_MESSAGE,
    ],
    [
      { role: 'solucao' as const, supplyId: 's', quantity: -2 },
      DRESSING_ITEM_QUANTITY_INVALID_MESSAGE,
    ],
  ])('Dado item inválido %o, Quando cria, Então recusa', (item, message) => {
    expect(() => create([item])).toThrow(message);
  });

  it('Dado o mesmo insumo duas vezes na mesma etapa, Quando cria, Então recusa', () => {
    expect(() =>
      create([
        { role: 'protecao', supplyId: 'pelicula', quantity: 1 },
        { role: 'protecao', supplyId: ' pelicula', quantity: 1 },
      ]),
    ).toThrow(DRESSING_ITEM_DUPLICATE_MESSAGE);
  });

  it('Dado mais itens que o limite, Quando cria, Então recusa; no limite, aceita', () => {
    const many = (count: number): DressingItem[] =>
      Array.from({ length: count }, (_, i) => ({
        role: 'cobertura_primaria',
        supplyId: `s-${i}`,
        quantity: 1,
      }));

    expect(create(many(DRESSING_ITEMS_MAX)).items).toHaveLength(
      DRESSING_ITEMS_MAX,
    );
    expect(() => create(many(DRESSING_ITEMS_MAX + 1))).toThrow(
      DRESSING_ITEMS_TOO_MANY_MESSAGE,
    );
  });

  it('Dado registro restaurado com e sem itens, Quando lê, Então devolve os itens ou lista vazia', () => {
    const base = {
      id: 'd-1',
      patientId: 'p-1',
      appointmentId: 'a-1',
      createdAt: new Date('2026-11-01T10:00:00Z'),
      content,
    };
    const items: DressingItem[] = [
      { role: 'solucao', supplyId: 'soro', quantity: 1 },
    ];

    const restored = DressingRecord.restore({ ...base, items });
    items.push({ role: 'fixacao', supplyId: 'fita', quantity: 1 });

    expect(restored.items).toEqual([
      { role: 'solucao', supplyId: 'soro', quantity: 1 },
    ]);
    expect(DressingRecord.restore(base).items).toEqual([]);
  });

  it('Dada cada etapa com insumo, Quando busca o rótulo, Então todas têm nome em português', () => {
    expect(
      DRESSING_ITEM_ROLES.map((role) => DRESSING_ITEM_ROLE_LABELS[role]),
    ).toEqual([
      'Solução de limpeza',
      'Proteção perilesional',
      'Cobertura primária',
      'Cobertura secundária',
      'Fixação',
    ]);
  });
});

describe('Feature: itens do curativo protegidos e no limite do banco (#963, T2; CodeRabbit no PR 1018)', () => {
  it('Dado item restaurado, Quando quem chamou altera o objeto original, Então o registro não muda', () => {
    const item: DressingItem = {
      role: 'solucao',
      supplyId: 'soro',
      quantity: 1,
    };
    const restored = DressingRecord.restore({
      id: 'd-2',
      patientId: 'p-1',
      appointmentId: 'a-1',
      createdAt: new Date('2026-11-01T10:00:00Z'),
      content,
      items: [item],
    });

    item.quantity = 0;

    expect(restored.items[0]?.quantity).toBe(1);
  });

  it('Dado registro criado, Quando tentam alterar um item lido, Então o item segue o validado', () => {
    const record = create([{ role: 'fixacao', supplyId: 'fita', quantity: 2 }]);
    const [item] = record.items as DressingItem[];

    expect(() => {
      (item as DressingItem).quantity = 0;
    }).toThrow(TypeError);
    expect(record.items[0]?.quantity).toBe(2);
  });

  it('Dada a quantidade no maior inteiro do banco, Quando cria, Então aceita; acima dele, recusa', () => {
    const at = (quantity: number) => [
      { role: 'solucao' as const, supplyId: 'soro', quantity },
    ];

    expect(create(at(DRESSING_ITEM_QUANTITY_MAX)).items[0]?.quantity).toBe(
      2_147_483_647,
    );
    expect(() => create(at(DRESSING_ITEM_QUANTITY_MAX + 1))).toThrow(
      DRESSING_ITEM_QUANTITY_INVALID_MESSAGE,
    );
  });
});
