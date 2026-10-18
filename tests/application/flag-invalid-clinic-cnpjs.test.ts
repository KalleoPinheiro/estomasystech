import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FlagInvalidClinicCnpjs } from '@/application/platform/flag-invalid-clinic-cnpjs';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAuditEventRepository } from '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

const NOW = new Date('2026-10-18T12:00:00.000Z');

describe('Feature: Saneamento de CNPJ antigo inválido (#355, ACE-RN-57)', () => {
  let db: PgliteDatabase<typeof schema>;
  let clinics: DrizzleClinicRepository;
  let useCase: FlagInvalidClinicCnpjs;
  const auditFor = (id: string) =>
    new DrizzleAuditEventRepository(db as unknown as AppDb, id);

  const insert = (id: string, cnpj: string | null) =>
    db.execute(
      sql`INSERT INTO clinics (id, name, created_at, created_by, cnpj)
          VALUES (${id}, ${`Clínica ${id}`}, now(), 'system', ${cnpj})`,
    );

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    clinics = new DrizzleClinicRepository(db as unknown as AppDb);
    useCase = new FlagInvalidClinicCnpjs(clinics, auditFor, () => NOW);
  });

  beforeEach(async () => {
    await db.delete(schema.auditEvents);
    await db.delete(schema.clinics);
    await insert('ok', '12.345.678/0001-95');
    await insert('sem', null);
    await insert('ruim', '12.345.678/0001-96');
  });

  it('Sem confirmar só lista: nada é gravado nem auditado', async () => {
    const found = await useCase.execute({ apply: false });

    expect(found).toEqual([
      expect.objectContaining({ clinicId: 'ruim', flaggedNow: false }),
    ]);
    expect((await clinics.findById('ruim'))?.cnpjReviewSince).toBeNull();
    expect(await auditFor('ruim').findAll({})).toHaveLength(0);
  });

  it('Confirmando, marca só a inválida sem alterar o número e audita sem o CNPJ; reexecutar não regrava', async () => {
    const first = await useCase.execute({ apply: true });
    const second = await useCase.execute({ apply: true });

    expect(first[0]?.flaggedNow).toBe(true);
    expect(second[0]?.flaggedNow).toBe(false);
    const ruim = await clinics.findById('ruim');
    expect(ruim?.cnpj).toBe('12.345.678/0001-96');
    expect(ruim?.cnpjReviewSince).toEqual(NOW);
    expect((await clinics.findById('ok'))?.cnpjReviewSince).toBeNull();
    const events = await auditFor('ruim').findAll({});
    expect(events).toHaveLength(1);
    expect(events[0]?.resourceType).toBe('clinic-cnpj-review');
    expect(events[0]?.detail).not.toContain('12.345');
  });

  it('Salvar um CNPJ válido pelo cadastro limpa a marca', async () => {
    await useCase.execute({ apply: true });
    const flagged = (await clinics.findById('ruim')) as NonNullable<
      Awaited<ReturnType<typeof clinics.findById>>
    >;

    await clinics.update(flagged.updateInfo({ cnpj: '98.765.432/0001-98' }));

    expect((await clinics.findById('ruim'))?.cnpjReviewSince).toBeNull();
    expect((await useCase.execute({ apply: true })).length).toBe(0);
  });
});
