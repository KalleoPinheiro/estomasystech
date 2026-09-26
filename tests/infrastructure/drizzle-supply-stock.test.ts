import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Supply } from '@/domain/inventory/supply';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleSupplyRepository } from '@/infrastructure/persistence/drizzle/drizzle-inventory-repositories';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

/**
 * Issue #192: `save` de insumo fazia upsert com o `stock_qty` do snapshot lido
 * — uma baixa atômica (`adjustStock`) entre a leitura e a gravação de uma
 * edição (ex.: renomear enquanto a conclusão da consulta baixa o kit) era
 * revertida. Estoque só muda por `adjustStock`.
 */
describe('Feature: edição de insumo não desfaz baixa de estoque (#192)', () => {
  let repo: DrizzleSupplyRepository;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    const db = drizzle(client, { schema }) as unknown as AppDb;
    repo = new DrizzleSupplyRepository(db, 'legacy-clinic');
  });

  it('C22 save de insumo não sobrescreve stock_qty', async () => {
    const supply = Supply.create({
      name: 'Placa 57mm',
      unit: 'un',
      minQty: 2,
      priceCents: 1500,
    });
    await repo.save(supply);
    await repo.adjustStock(supply.id, 10);

    // Tela de edição lê o insumo (estoque 10)…
    const editing = await repo.findById(supply.id);
    expect(editing?.stockQty).toBe(10);
    // …a conclusão de uma consulta baixa 3 no meio do caminho…
    await repo.adjustStock(supply.id, -3);
    // …e a edição grava o snapshot antigo com o nome novo.
    await repo.save((editing as Supply).update({ name: 'Placa 57mm (nova)' }));

    const saved = await repo.findById(supply.id);
    expect(saved?.name).toBe('Placa 57mm (nova)');
    expect(saved?.stockQty).toBe(7);
  });

  it('insumo novo entra com o estoque do objeto', async () => {
    const supply = Supply.create({
      name: 'Gaze',
      unit: 'pct',
      minQty: 0,
      priceCents: 300,
    });

    await repo.save(supply);

    expect((await repo.findById(supply.id))?.stockQty).toBe(0);
  });
});
