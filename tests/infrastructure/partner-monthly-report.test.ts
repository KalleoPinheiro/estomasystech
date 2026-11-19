import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Partner } from '@/domain/partner/partner';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzlePartnerRepository } from '@/infrastructure/persistence/drizzle/drizzle-partner-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { InMemoryPartnerRepository } from '@/infrastructure/persistence/in-memory/in-memory-partner-repository';
import { createPgliteFromTemplate } from '../support/pglite-template';

const semBanco = {} as AppDb;

describe('Feature: Marca do mês do relatório do parceiro', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;

  const repo = (clinicId: string | null = 'legacy-clinic') =>
    new DrizzlePartnerRepository(appDb, clinicId);

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;
  });

  beforeEach(async () => {
    await db.delete(schema.partners);
  });

  async function savePartner(): Promise<Partner> {
    const partner = Partner.create({
      fullName: 'Beatriz Nunes',
      email: 'beatriz@example.com',
      phone: '11999990000',
    });
    await repo().save(partner);
    return partner;
  }

  it('Dado o mês já gravado, Quando outra execução reivindica o mesmo mês, Então não grava de novo', async () => {
    const partner = await savePartner();
    const memory = new InMemoryPartnerRepository();
    await memory.save(partner);

    expect(await repo().claimMonthlyReport(partner.id, '2026-11')).toBe(true);
    expect(await repo().claimMonthlyReport(partner.id, '2026-11')).toBe(false);
    expect(await repo().claimMonthlyReport('ninguem', '2026-11')).toBe(false);
    expect(
      await repo('outra-clinica').claimMonthlyReport(partner.id, '2026-11'),
    ).toBe(false);
    await repo().releaseMonthlyReport(partner.id, '2026-10');
    expect(await repo().claimMonthlyReport(partner.id, '2026-11')).toBe(false);
    expect(await repo().claimMonthlyReport(partner.id, '2026-12')).toBe(true);

    expect(await memory.claimMonthlyReport(partner.id, '2026-11')).toBe(true);
    expect(await memory.claimMonthlyReport(partner.id, '2026-11')).toBe(false);
    expect(await memory.claimMonthlyReport('ninguem', '2026-11')).toBe(false);
    await memory.releaseMonthlyReport(partner.id, '2026-10');
    expect(await memory.claimMonthlyReport(partner.id, '2026-11')).toBe(false);
    await memory.releaseMonthlyReport(partner.id, '2026-11');
    expect(await memory.claimMonthlyReport(partner.id, '2026-11')).toBe(true);
  });

  it('Dado o mês gravado, Quando o cadastro é salvo de novo, Então a coluna sobrevive e o release solta o mês', async () => {
    const partner = await savePartner();
    expect(await repo().claimMonthlyReport(partner.id, '2026-11')).toBe(true);
    await repo().save(partner);
    expect(await repo().claimMonthlyReport(partner.id, '2026-11')).toBe(false);
    await repo().releaseMonthlyReport(partner.id, '2026-11');
    expect(await repo().claimMonthlyReport(partner.id, '2026-11')).toBe(true);
  });

  it('Dado papel de sistema, Quando grava ou solta o mês, Então recusa sem banco', async () => {
    const system = new DrizzlePartnerRepository(semBanco, null);
    await expect(system.claimMonthlyReport('p', '2026-11')).rejects.toThrow(
      'Papel de sistema não pode gravar o relatório do parceiro',
    );
    await expect(system.releaseMonthlyReport('p', '2026-11')).rejects.toThrow(
      'Papel de sistema não pode gravar o relatório do parceiro',
    );
  });
});
