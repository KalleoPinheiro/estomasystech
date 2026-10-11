import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { DataSubjectRequest } from '@/domain/patient/data-subject-request';
import { Patient } from '@/domain/patient/patient';
import {
  ConflictError,
  InvalidStatusTransitionError,
} from '@/domain/shared/errors';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleDataSubjectRequestRepository } from '@/infrastructure/persistence/drizzle/drizzle-data-subject-request-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER as cipher } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

describe('DrizzleDataSubjectRequestRepository: corridas (#293)', () => {
  let repo: DrizzleDataSubjectRequestRepository;
  let patientId: string;

  beforeAll(async () => {
    const db: PgliteDatabase<typeof schema> = drizzle(
      await createPgliteFromTemplate(),
      { schema },
    );
    const appDb = db as unknown as AppDb;
    const patient = Patient.create({
      fullName: 'Paciente Corrida',
      email: 'corrida@x.com',
      phone: '1',
    });
    await new DrizzlePatientRepository(appDb, 'legacy-clinic', cipher).save(
      patient,
    );
    patientId = patient.id;
    repo = new DrizzleDataSubjectRequestRepository(
      appDb,
      'legacy-clinic',
      cipher,
    );
  });

  it('dois pedidos pendentes do mesmo tipo: o índice único barra o segundo (409)', async () => {
    await repo.save(DataSubjectRequest.create({ patientId, kind: 'erasure' }));

    await expect(
      repo.save(DataSubjectRequest.create({ patientId, kind: 'erasure' })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('duas decisões sobre o mesmo pedido: só a primeira grava', async () => {
    const request = DataSubjectRequest.create({
      patientId,
      kind: 'correction',
      details: 'nome',
    });
    await repo.save(request);

    await repo.save(request.accept('primeira'));
    await expect(repo.save(request.reject('segunda'))).rejects.toBeInstanceOf(
      InvalidStatusTransitionError,
    );
    expect((await repo.findById(request.id))?.resolution).toBe('primeira');
  });

  it('papel de sistema não grava', async () => {
    const system = new DrizzleDataSubjectRequestRepository(
      {} as AppDb,
      null,
      cipher,
    );

    await expect(
      system.save(DataSubjectRequest.create({ patientId, kind: 'erasure' })),
    ).rejects.toThrow(/Papel de sistema/);
  });
});
