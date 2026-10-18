import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import { Guardian } from '@/domain/guardian/guardian';
import { Patient } from '@/domain/patient/patient';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzleGuardianRepository } from '@/infrastructure/persistence/drizzle/drizzle-guardian-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';
const OTHER = 'guardian-clinic-b';

const newGuardian = (fullName: string, email: string | null = null) =>
  Guardian.create({
    fullName,
    relationship: 'cuidador',
    phone: '11999990000',
    email,
  });

describe('Feature: Responsável no banco (#329, migração 0059)', () => {
  let appDb: AppDb;
  let repo: DrizzleGuardianRepository;
  let otherRepo: DrizzleGuardianRepository;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    appDb = drizzle(client, { schema }) as unknown as AppDb;
    await new DrizzleClinicRepository(appDb).create(
      Clinic.restore({
        id: OTHER,
        name: 'Clínica B',
        createdBy: 'test',
        createdAt: new Date(),
      }),
    );
    repo = new DrizzleGuardianRepository(appDb, CLINIC);
    otherRepo = new DrizzleGuardianRepository(appDb, OTHER);
  });

  it('Dado responsável, Quando salvar duas vezes e ler, Então faz upsert e preserva os campos', async () => {
    const guardian = newGuardian('Carla Cuidadora', 'carla@x.com');
    await repo.save(guardian);
    await repo.save(guardian.update({ fullName: 'Carla C. Cuidadora' }));

    const found = await repo.findById(guardian.id);

    expect(found).toMatchObject({
      fullName: 'Carla C. Cuidadora',
      relationship: 'cuidador',
      phone: '+5511999990000',
      email: 'carla@x.com',
    });
  });

  it('Dado responsáveis das duas empresas, Quando buscar, Então só vê os da própria e filtra por nome, telefone e e-mail', async () => {
    const mine = newGuardian('Dora Doméstica', 'dora@x.com');
    await repo.save(mine);
    const theirs = newGuardian('Dora da Outra');
    await otherRepo.save(theirs);

    expect(await repo.findById(theirs.id)).toBeNull();
    const byName = await repo.findAll('doméstica');
    expect(byName.map((g) => g.id)).toEqual([mine.id]);
    expect((await repo.findAll('dora@x')).map((g) => g.id)).toEqual([mine.id]);
    expect((await repo.findAll('+55119999')).length).toBeGreaterThan(0);
    expect((await repo.findAll()).map((g) => g.id)).not.toContain(theirs.id);
    expect((await otherRepo.findAll()).map((g) => g.id)).toEqual([theirs.id]);
  });

  it('Dado vários ids, Quando buscar em lote, Então traz só os da empresa, sem duplicar, e vazio não consulta', async () => {
    const a = newGuardian('Ana Lote', 'ana@x.com');
    const b = newGuardian('Bia Lote');
    const theirs = newGuardian('Cida Outra');
    await repo.save(a);
    await repo.save(b);
    await otherRepo.save(theirs);

    const found = await repo.findByIds([a.id, b.id, a.id, theirs.id, 'sem-id']);

    expect(found.map((g) => g.id).sort()).toEqual([a.id, b.id].sort());
    expect(await repo.findByIds([])).toEqual([]);
  });

  it('Dado escopo de sistema, Quando salvar ou excluir, Então recusa; ler vê todas as empresas', async () => {
    const system = new DrizzleGuardianRepository(appDb, null);
    const guardian = newGuardian('Eva Eventual');

    await expect(system.save(guardian)).rejects.toThrow(/somente leitura/);
    await expect(system.delete(guardian.id)).rejects.toThrow(/somente leitura/);
    await repo.save(guardian);
    expect(await system.findById(guardian.id)).not.toBeNull();
  });

  it('Dado responsável de outra empresa, Quando excluir pelo escopo errado, Então nada muda', async () => {
    const theirs = newGuardian('Fabi da Outra');
    await otherRepo.save(theirs);

    await repo.delete(theirs.id);

    expect(await otherRepo.findById(theirs.id)).not.toBeNull();
    await otherRepo.delete(theirs.id);
    expect(await otherRepo.findById(theirs.id)).toBeNull();
  });

  it('Dado pacientes ligados, Quando findByGuardian, Então devolve só os da empresa e ordena por nome', async () => {
    const patients = new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER);
    const guardian = newGuardian('Gabi Guardiã');
    await repo.save(guardian);
    const zeca = Patient.create({
      fullName: 'Zeca Lima',
      phone: '11988880000',
      guardianId: guardian.id,
    });
    const abel = Patient.create({
      fullName: 'Abel Lima',
      phone: '11988880001',
      guardianId: guardian.id,
    });
    await patients.save(zeca);
    await patients.save(abel);

    const linked = await patients.findByGuardian(guardian.id);

    expect(linked.map((p) => p.fullName)).toEqual(['Abel Lima', 'Zeca Lima']);
    expect((await patients.findById(abel.id))?.guardianId).toBe(guardian.id);
    expect(
      await new DrizzlePatientRepository(
        appDb,
        OTHER,
        TEST_CIPHER,
      ).findByGuardian(guardian.id),
    ).toEqual([]);
  });
});
