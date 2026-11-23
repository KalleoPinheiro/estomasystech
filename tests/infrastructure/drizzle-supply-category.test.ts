import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Supply } from '@/domain/inventory/supply';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleSupplyRepository } from '@/infrastructure/persistence/drizzle/drizzle-inventory-repositories';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

describe('Feature: categoria do insumo persiste (#963 D2)', () => {
  let db: AppDb;
  let repo: DrizzleSupplyRepository;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema }) as unknown as AppDb;
    repo = new DrizzleSupplyRepository(db, 'legacy-clinic');
  });

  it('grava, troca e limpa a categoria', async () => {
    const supply = Supply.create({
      name: 'Alginato',
      unit: 'un',
      minQty: 0,
      priceCents: 2000,
      category: 'cobertura',
    });
    await repo.save(supply);
    expect((await repo.findById(supply.id))?.category).toBe('cobertura');

    await repo.save(supply.update({ category: 'solucao' }));
    expect((await repo.findById(supply.id))?.category).toBe('solucao');

    await repo.save(supply.update({ category: null }));
    expect((await repo.findById(supply.id))?.category).toBeNull();
  });

  it('valor desconhecido no banco vira sem categoria', async () => {
    const supply = Supply.create({
      name: 'PHMB',
      unit: 'fr',
      minQty: 0,
      priceCents: 500,
    });
    await repo.save(supply);
    await db
      .update(schema.supplies)
      .set({ category: 'antiga' })
      .where(eq(schema.supplies.id, supply.id));

    const all = await repo.findAll();
    expect(all.find((s) => s.id === supply.id)?.category).toBeNull();
  });
});
