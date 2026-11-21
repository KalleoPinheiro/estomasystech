import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanDiagnosis } from '@/domain/clinical/care-plan-diagnosis';
import { Patient } from '@/domain/patient/patient';
import { ClinicNursingDiagnosis } from '@/domain/taxonomy/clinic-nursing-diagnosis';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  DrizzleCarePlanDiagnosisRepository,
  DrizzleCarePlanRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-care-plan-repositories';
import { DrizzleClinicDiagnosisRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-diagnosis-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC_A = 'legacy-clinic';
const CLINIC_B = 'clinic-diag-b';

describe('Feature: persistência do catálogo de diagnósticos da clínica (#954)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;
    await db.insert(schema.clinics).values({
      id: CLINIC_B,
      name: 'Clínica B',
      createdBy: 'test',
      createdAt: new Date(),
    });
  });

  beforeEach(async () => {
    await db.delete(schema.clinicDiagnoses);
  });

  const repoA = () => new DrizzleClinicDiagnosisRepository(appDb, CLINIC_A);
  const repoB = () => new DrizzleClinicDiagnosisRepository(appDb, CLINIC_B);
  const item = (
    label: string,
    extra: Partial<{ code: string; clinicId: string }> = {},
  ) => ClinicNursingDiagnosis.create({ clinicId: CLINIC_A, label, ...extra });

  it('Dado itens gravados, Quando listar e buscar, Então devolve só os da empresa, por título', async () => {
    await repoA().saveMany([
      item('Risco de infecção'),
      item('Integridade da pele prejudicada', { code: '00046' }),
    ]);
    await repoB().save(
      ClinicNursingDiagnosis.create({ clinicId: CLINIC_B, label: 'Dor aguda' }),
    );

    expect((await repoA().list()).map((d) => d.label)).toEqual([
      'Integridade da pele prejudicada',
      'Risco de infecção',
    ]);
    expect((await repoA().search('00046')).map((d) => d.code)).toEqual([
      '00046',
    ]);
    expect(await repoA().search('dor')).toEqual([]);
    expect((await repoB().search('dor')).map((d) => d.label)).toEqual([
      'Dor aguda',
    ]);
    expect(await repoA().search('pele', { limit: 0 })).toEqual([]);
  });

  it('Dado termo com % e _, Quando buscar, Então trata como texto', async () => {
    await repoA().saveMany([item('Dor aguda'), item('Dor 100% controlada')]);
    expect((await repoA().search('100%')).map((d) => d.label)).toEqual([
      'Dor 100% controlada',
    ]);
    expect(await repoA().search('_')).toEqual([]);
  });

  it('Dado item salvo, Quando desativar, Então atualiza no lugar e some da busca', async () => {
    const diagnosis = item('Dor aguda', { code: '00132' });
    await repoA().save(diagnosis);
    await repoA().save(diagnosis.deactivate());

    const stored = await repoA().findById(diagnosis.id);
    expect(stored?.isActive).toBe(false);
    expect(stored?.code).toBe('00132');
    expect(await repoA().search('dor')).toEqual([]);
    expect(await repoB().findById(diagnosis.id)).toBeNull();
    expect(await repoA().findById('nope')).toBeNull();
  });

  it('Dado lista vazia, Quando salvar em lote, Então não faz nada', async () => {
    await repoA().saveMany([]);
    expect(await repoA().list()).toEqual([]);
  });

  it('Dado papel de sistema ou item de outra empresa, Quando salvar, Então recusa', async () => {
    const system = new DrizzleClinicDiagnosisRepository(appDb, null);
    await expect(system.save(item('Dor aguda'))).rejects.toThrow(
      'Papel de sistema',
    );
    await expect(repoB().saveMany([item('Dor aguda')])).rejects.toThrow(
      'Diagnóstico de outra empresa',
    );
    expect(await system.list()).toEqual([]);
  });

  it('Dado diagnóstico digitado no plano, Quando salvar, Então o título fica cifrado no banco e volta legível', async () => {
    const patient = Patient.create({
      fullName: 'Paciente Teste',
      email: 'diag-954@example.com',
      phone: '11999990954',
    });
    await new DrizzlePatientRepository(appDb, CLINIC_A, TEST_CIPHER).save(
      patient,
    );
    const plan = CarePlan.create({ patientId: patient.id });
    await new DrizzleCarePlanRepository(appDb, CLINIC_A).save(plan);
    const repo = new DrizzleCarePlanDiagnosisRepository(
      appDb,
      CLINIC_A,
      TEST_CIPHER,
    );
    const diagnosis = CarePlanDiagnosis.create({
      carePlanId: plan.id,
      diagnosisCode: null,
      diagnosisLabel: 'Pele periestomal irritada',
      type: 'sindrome',
      definingCharacteristics: 'Dor; prurido',
    });
    await repo.save(diagnosis);

    const [row] = await db
      .select()
      .from(schema.carePlanDiagnoses)
      .where(eq(schema.carePlanDiagnoses.id, diagnosis.id));
    expect(row?.diagnosisCode).toBeNull();
    expect(row?.diagnosisLabel).not.toContain('periestomal');

    const [back] = await repo.findByCarePlanId(plan.id);
    expect(back?.diagnosisLabel).toBe('Pele periestomal irritada');
    expect(back?.diagnosisCode).toBeNull();
    expect(back?.type).toBe('sindrome');
  });
});
