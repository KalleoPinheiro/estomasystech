import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const civil = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * #992: o celular casa pelo índice cego e o nome com o nascimento são
 * decifrados só da empresa; nada de outra empresa aparece.
 */
describe('Feature: possíveis repetidos no Postgres (#992)', () => {
  let db: AppDb;
  let repo: DrizzlePatientRepository;
  let ana: Patient;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema }) as unknown as AppDb;
    repo = new DrizzlePatientRepository(db, 'legacy-clinic', TEST_CIPHER);
    await db.insert(schema.clinics).values({
      id: 'dup-clinic-b',
      name: 'Clínica B',
      createdBy: 'test',
      createdAt: new Date(),
    });
    ana = Patient.create({
      fullName: 'Ana Lima',
      phone: '11988887777',
      birthDate: civil('1960-04-12'),
    });
    await repo.save(ana);
    await repo.save(
      Patient.create({ fullName: 'Bia Lima', phone: '11911112222' }),
    );
    // Mesma pessoa em outra empresa: nunca aparece aqui.
    await new DrizzlePatientRepository(db, 'dup-clinic-b', TEST_CIPHER).save(
      Patient.create({
        fullName: 'Ana Lima',
        phone: '11988887777',
        birthDate: civil('1960-04-12'),
      }),
    );
  });

  const candidate = (
    extra: Partial<Parameters<typeof repo.findPossibleDuplicates>[0]>,
  ) => ({
    fullName: 'Outro Nome',
    phone: '11900000000',
    birthDate: null,
    ...extra,
  });

  it('Dado o mesmo celular, Então acha pelo índice cego só na empresa', async () => {
    const found = await repo.findPossibleDuplicates(
      candidate({ phone: '+55 (11) 98888-7777' }),
    );
    expect(found.map((p) => p.id)).toEqual([ana.id]);
  });

  it('Dado o mesmo nome e nascimento, Então acha decifrando só a empresa', async () => {
    const found = await repo.findPossibleDuplicates(
      candidate({ fullName: 'ana lima', birthDate: civil('1960-04-12') }),
    );
    expect(found.map((p) => p.id)).toEqual([ana.id]);
    expect(found[0].birthDate).toEqual(civil('1960-04-12'));
  });

  it('Dado o mesmo nome com outro nascimento, Então não acha', async () => {
    const found = await repo.findPossibleDuplicates(
      candidate({ fullName: 'Ana Lima', birthDate: civil('1999-01-01') }),
    );
    expect(found).toEqual([]);
  });

  it('Dado celular inválido, Então não consulta o índice e não acha', async () => {
    expect(
      await repo.findPossibleDuplicates(candidate({ phone: 'abc' })),
    ).toEqual([]);
  });

  it('Dado repositório sem empresa, Então não procura', async () => {
    const semEmpresa = new DrizzlePatientRepository(db, null, TEST_CIPHER);
    expect(
      await semEmpresa.findPossibleDuplicates(
        candidate({ phone: '11988887777' }),
      ),
    ).toEqual([]);
  });
});
