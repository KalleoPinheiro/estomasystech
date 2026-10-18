import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleTransactionManager } from '@/infrastructure/persistence/drizzle/drizzle-transaction-manager';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

/**
 * #363: o PGlite da suíte tem uma conexão só e serializa transações, então
 * "roda em transação" e "trava a linha" não se distinguem pelo resultado. No
 * Postgres real é o `FOR UPDATE` do paciente que faz o segundo envio esperar o
 * primeiro confirmar — aqui se prova que a leitura o emite (mesma estratégia
 * do `drizzle-invoice-lock.test.ts`, #192).
 */
describe('Feature: leitura do paciente com lock de linha (#363)', () => {
  const queries: string[] = [];
  let db: AppDb;
  let repo: DrizzlePatientRepository;
  let patientId: string;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, {
      schema,
      logger: { logQuery: (query) => queries.push(query) },
    }) as unknown as AppDb;
    const patient = Patient.create({
      fullName: 'Paciente Lock',
      email: 'lock-paciente@x.com',
      phone: '11999990000',
    });
    repo = new DrizzlePatientRepository(db, 'legacy-clinic', TEST_CIPHER);
    await repo.save(patient);
    patientId = patient.id;
  });

  it('findByIdForUpdate trava a linha do paciente (SELECT … FOR UPDATE)', async () => {
    queries.length = 0;

    const found = await repo.findByIdForUpdate(patientId);

    expect(found?.id).toBe(patientId);
    const select = queries.find((q) => /from "patients"/i.test(q));
    expect(select).toMatch(/for update$/i);
  });

  it('findById comum não trava', async () => {
    queries.length = 0;

    await repo.findById(patientId);

    const select = queries.find((q) => /from "patients"/i.test(q));
    expect(select).not.toMatch(/for update/i);
  });

  it('paciente de outra empresa ou inexistente → null (o lock respeita o escopo)', async () => {
    const other = new DrizzlePatientRepository(
      db,
      'outra-clinica',
      TEST_CIPHER,
    );

    expect(await other.findByIdForUpdate(patientId)).toBeNull();
    expect(await repo.findByIdForUpdate('nao-existe')).toBeNull();
  });

  it('o escopo transacional expõe o paciente com lock e os repositórios do portal', async () => {
    const manager = new DrizzleTransactionManager(
      db,
      'legacy-clinic',
      TEST_CIPHER,
    );

    const found = await manager.run(
      async ({
        patients,
        conditions,
        conditionPhotos,
        scheduleConfig,
        scheduleAvailability,
      }) => {
        expect(conditions).toBeDefined();
        expect(conditionPhotos).toBeDefined();
        expect(scheduleConfig).toBeDefined();
        expect(scheduleAvailability).toBeDefined();
        return patients.findByIdForUpdate(patientId);
      },
    );

    expect(found?.id).toBe(patientId);
  });
});
