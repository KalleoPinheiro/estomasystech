import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { Patient } from '@/domain/patient/patient';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzleConsentRecordRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinical-repositories';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

describe('Feature: Isolamento de Consentimento por empresa (MT-27)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let patientId: string;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;

    const clinicRepo = new DrizzleClinicRepository(appDb);
    await clinicRepo.create(
      Clinic.restore({
        id: 'clinic-b',
        name: 'Clínica B',
        createdBy: 'test',
        createdAt: new Date(),
      }),
    );

    const patientRepo = new DrizzlePatientRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    const patient = Patient.create({
      fullName: 'Paciente Teste',
      email: 'consent-isolation@x.com',
      phone: '11999990000',
    });
    await patientRepo.save(patient);
    patientId = patient.id;

    const consentRepoA = new DrizzleConsentRecordRepository(
      appDb,
      'legacy-clinic',
    );
    await consentRepoA.save(
      ConsentRecord.create({
        patientId,
        consentText: 'termo v1',
        textVersion: 'v1',
        ipAddress: '127.0.0.1',
      }),
    );
  });

  it('Dado consentimento salvo pela clínica A, Quando a clínica B busca pelo mesmo patientId, Então não encontra nada', async () => {
    const consentRepoB = new DrizzleConsentRecordRepository(appDb, 'clinic-b');

    const records = await consentRepoB.findByPatientId(patientId);

    expect(records).toHaveLength(0);
  });

  it('Dado consentimento salvo pela clínica A, Quando a própria clínica A busca, Então encontra o registro', async () => {
    const consentRepoA = new DrizzleConsentRecordRepository(
      appDb,
      'legacy-clinic',
    );

    const records = await consentRepoA.findByPatientId(patientId);

    expect(records).toHaveLength(1);
  });

  it('Dado papel de sistema (clinicId null), Quando salvar consentimento, Então lança erro', async () => {
    const systemRepo = new DrizzleConsentRecordRepository(appDb, null);

    await expect(
      systemRepo.save(
        ConsentRecord.create({
          patientId,
          consentText: 'termo v2',
          textVersion: 'v1',
          ipAddress: null,
        }),
      ),
    ).rejects.toThrow('Papel de sistema não pode salvar consentimento');
  });
});

describe('Feature: Versionamento e revogação de consentimento persistidos (#70)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let patientId: string;
  let consentRepo: DrizzleConsentRecordRepository;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;

    const patientRepo = new DrizzlePatientRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    const patient = Patient.create({
      fullName: 'Paciente Versionamento',
      email: 'consent-versioning@x.com',
      phone: '11988880000',
    });
    await patientRepo.save(patient);
    patientId = patient.id;

    consentRepo = new DrizzleConsentRecordRepository(appDb, 'legacy-clinic');
  });

  it('Dado aceite com versão, Quando salvar e ler, Então kind e textVersion persistem', async () => {
    const accept = ConsentRecord.create({
      patientId,
      consentText: 'termo v1',
      textVersion: 'v1',
      ipAddress: '10.0.0.1',
    });
    await consentRepo.save(accept);

    const [found] = await consentRepo.findByPatientId(patientId);

    expect(found.kind).toBe('accept');
    expect(found.textVersion).toBe('v1');
  });

  it('Dado revogação registrada, Quando salvar e ler, Então kind revoke persiste sem textVersion', async () => {
    // acceptedAt explícito (via restore) evita empate de timestamp com o aceite
    // do teste anterior — garante ordenação determinística no teste seguinte.
    const revoke = ConsentRecord.restore({
      id: `${patientId}-revoke-1`,
      patientId,
      kind: 'revoke',
      textHash: '',
      textVersion: null,
      ipAddress: '10.0.0.2',
      acceptedAt: new Date(Date.now() + 1000),
    });
    await consentRepo.save(revoke);

    const records = await consentRepo.findByPatientId(patientId);
    const found = records.find((r) => r.id === revoke.id);

    expect(found?.kind).toBe('revoke');
    expect(found?.textVersion).toBeNull();
  });

  it('Dado múltiplos registros, Quando buscar o mais recente, Então findLatestByPatientId retorna o de acceptedAt mais alto', async () => {
    const latest = await consentRepo.findLatestByPatientId(patientId);

    expect(latest?.kind).toBe('revoke');
  });

  it('Dado paciente sem nenhum registro, Quando buscar o mais recente, Então retorna null', async () => {
    const latest = await consentRepo.findLatestByPatientId(
      'paciente-inexistente',
    );

    expect(latest).toBeNull();
  });
});
