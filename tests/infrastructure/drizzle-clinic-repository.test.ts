import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import { newId } from '@/domain/shared/id';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

/** Clínica só com nome, como a `legacy-clinic` nasceu (migração 0019). */
const bareClinic = (name: string, createdBy: string): Clinic =>
  Clinic.restore({ id: newId(), name, createdBy, createdAt: new Date() });

describe('Feature: Persistência de Clinic (Drizzle)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let clinicRepo: DrizzleClinicRepository;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;
    clinicRepo = new DrizzleClinicRepository(appDb);
  });

  beforeEach(async () => {
    await db.delete(schema.clinics);
  });

  describe('Cenário: clínica ida e volta (roundtrip)', () => {
    it('Dado uma clínica criada, Quando buscar por id, Então retorna os campos salvos', async () => {
      const clinic = bareClinic('Clínica Alfa', 'super-admin@vitta.com');

      await clinicRepo.create(clinic);
      const stored = await clinicRepo.findById(clinic.id);

      expect(stored?.id).toBe(clinic.id);
      expect(stored?.name).toBe('Clínica Alfa');
      expect(stored?.createdBy).toBe('super-admin@vitta.com');
      expect(stored?.createdAt).toEqual(clinic.createdAt);
    });

    it('Dado um id inexistente, Quando buscar por id, Então retorna null', async () => {
      const stored = await clinicRepo.findById(
        '00000000-0000-0000-0000-000000000000',
      );

      expect(stored).toBeNull();
    });
  });

  describe('Cenário: update de dados cadastrais (issue #61)', () => {
    it('Dada uma clínica criada, Quando atualizar os dados cadastrais, Então findById reflete os novos valores', async () => {
      const clinic = bareClinic('Clínica Beta', 'admin@vitta.com');
      await clinicRepo.create(clinic);

      const updated = clinic.updateInfo({
        cnpj: '12.345.678/0001-90',
        address: 'Rua das Flores, 100',
        city: 'São Paulo',
        professionalName: 'Enf. Ana',
        professionalRegistry: 'COREN-SP 123456',
      });
      await clinicRepo.update(updated);
      const stored = await clinicRepo.findById(clinic.id);

      expect(stored?.cnpj).toBe('12.345.678/0001-90');
      expect(stored?.address).toBe('Rua das Flores, 100');
      expect(stored?.city).toBe('São Paulo');
      expect(stored?.professionalName).toBe('Enf. Ana');
      expect(stored?.professionalRegistry).toBe('COREN-SP 123456');
      expect(stored?.name).toBe('Clínica Beta');
      expect(stored?.createdBy).toBe('admin@vitta.com');
    });

    it('Dada uma clínica criada, Quando atualizar a razão social, Então findById reflete o novo nome', async () => {
      const clinic = bareClinic('Clínica Delta', 'admin3@vitta.com');
      await clinicRepo.create(clinic);

      await clinicRepo.update(
        clinic.updateInfo({ name: 'Clínica Delta Ltda' }),
      );
      const stored = await clinicRepo.findById(clinic.id);

      expect(stored?.name).toBe('Clínica Delta Ltda');
    });

    it('Dado update parcial, Quando buscar por id, Então name/createdBy/createdAt permanecem intactos', async () => {
      const clinic = bareClinic('Clínica Gama', 'admin2@vitta.com');
      await clinicRepo.create(clinic);

      await clinicRepo.update(
        clinic.updateInfo({ cnpj: '99.999.999/0001-00' }),
      );
      const stored = await clinicRepo.findById(clinic.id);

      expect(stored?.cnpj).toBe('99.999.999/0001-00');
      expect(stored?.address).toBeNull();
      expect(stored?.city).toBeNull();
      expect(stored?.professionalName).toBeNull();
      expect(stored?.professionalRegistry).toBeNull();
      expect(stored?.name).toBe('Clínica Gama');
      expect(stored?.createdBy).toBe('admin2@vitta.com');
      expect(stored?.createdAt).toEqual(clinic.createdAt);
    });

    it('Dadas duas clínicas, Quando atualizar uma, Então a outra permanece sem dados cadastrais', async () => {
      const clinicA = bareClinic('Clínica A', 'a@vitta.com');
      const clinicB = bareClinic('Clínica B', 'b@vitta.com');
      await clinicRepo.create(clinicA);
      await clinicRepo.create(clinicB);

      await clinicRepo.update(
        clinicA.updateInfo({ cnpj: '11.111.111/0001-11' }),
      );
      const storedB = await clinicRepo.findById(clinicB.id);

      expect(storedB?.cnpj).toBeNull();
    });
  });

  describe('Cenário: contato da clínica (B4)', () => {
    it('Dada clínica criada pela plataforma, Quando gravar e editar o contato, Então findById e findByCnpj devolvem o contato', async () => {
      const clinic = Clinic.create({
        name: 'Clínica Contato',
        cnpj: '12345678000195',
        contactPhone: '11 3333-4444',
        contactEmail: 'Contato@Clinica.com',
        createdBy: 'dono@vitta.app',
      });
      await clinicRepo.create(clinic);

      const created = await clinicRepo.findById(clinic.id);
      expect(created?.contactPhone).toBe('11 3333-4444');
      expect(created?.contactEmail).toBe('contato@clinica.com');
      expect(created?.cnpj).toBe('12.345.678/0001-95');
      expect((await clinicRepo.findByCnpj('12.345.678/0001-95'))?.id).toBe(
        clinic.id,
      );

      await clinicRepo.update(
        clinic.updateInfo({
          contactPhone: '11 98888-7777',
          contactEmail: 'novo@clinica.com',
        }),
      );
      const edited = await clinicRepo.findById(clinic.id);
      expect(edited?.contactPhone).toBe('11 98888-7777');
      expect(edited?.contactEmail).toBe('novo@clinica.com');
      expect(await clinicRepo.findByCnpj('99.999.999/0001-99')).toBeNull();
    });
  });

  describe('Cenário: estado da clínica (B5, #214)', () => {
    it('Dada clínica suspensa por saveStatus, Quando um update de cadastro usa a instância antiga, Então o estado persiste e findById/findAll o devolvem', async () => {
      const clinic = bareClinic('Clínica Estado', 'root@vitta.com');
      await clinicRepo.create(clinic);
      const at = new Date('2026-09-27T12:00:00.000Z');

      await clinicRepo.saveStatus(clinic.suspend('root@vitta.com', at));
      // Edição concorrente com a instância lida antes da suspensão.
      await clinicRepo.update(clinic.updateInfo({ city: 'Recife' }));

      const stored = await clinicRepo.findById(clinic.id);
      expect(stored?.status).toBe('suspended');
      expect(stored?.statusChangedAt).toEqual(at);
      expect(stored?.statusChangedBy).toBe('root@vitta.com');
      expect(stored?.city).toBe('Recife');
      const listed = (await clinicRepo.findAll()).find(
        (c) => c.id === clinic.id,
      );
      expect(listed?.status).toBe('suspended');

      await clinicRepo.saveStatus(
        (stored as Clinic).reactivate('root@vitta.com', new Date()),
      );
      expect((await clinicRepo.findById(clinic.id))?.status).toBe('active');
    });
  });
});
