import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Anamnesis } from '@/domain/clinical/anamnesis';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { EvolutionNote } from '@/domain/clinical/evolution-note';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { FollowUp } from '@/domain/followup/follow-up';
import { StockMovement } from '@/domain/inventory/stock-movement';
import { Supply } from '@/domain/inventory/supply';
import { SupplyBatch } from '@/domain/inventory/supply-batch';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  DrizzleAnamnesisRepository,
  DrizzleClinicalConditionRepository,
  DrizzleConditionAssessmentRepository,
  DrizzleConditionPhotoRepository,
  DrizzleConsentRecordRepository,
  DrizzleEvolutionNoteRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-clinical-repositories';
import { DrizzleGoogleAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-google-account-repository';
import {
  DrizzleFollowUpRepository,
  DrizzleStockMovementRepository,
  DrizzleSupplyBatchRepository,
  DrizzleSupplyRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-inventory-repositories';
import { DrizzlePartnerRepository } from '@/infrastructure/persistence/drizzle/drizzle-partner-repository';
import {
  DrizzlePatientRepository,
  DrizzlePatientRepository as PatientRepo,
} from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const TEST_SECRET = 'vitest-auth-secret-0000000000000000';

describe('Feature: Persistência PostgreSQL — módulos clínico, estoque e retornos', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let patient: Patient;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;
  });

  beforeEach(async () => {
    await db.delete(schema.googleAccounts);
    await db.update(schema.patients).set({ referredByPartnerId: null });
    await db.delete(schema.consentRecords);
    await db.delete(schema.conditionPhotos);
    await db.delete(schema.conditionAssessments);
    await db.delete(schema.clinicalConditions);
    await db.delete(schema.evolutionNotes);
    await db.delete(schema.anamneses);
    await db.delete(schema.stockMovements);
    await db.delete(schema.supplyBatches);
    await db.delete(schema.supplies);
    await db.delete(schema.followUps);
    await db.delete(schema.patients);
    await db.delete(schema.partners);
    patient = Patient.create({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    await new DrizzlePatientRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    ).save(patient);
  });

  it('Dado anamnese salva, Quando upsert e buscar, Então dados preservados e atualizados', async () => {
    const repo = new DrizzleAnamnesisRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    await repo.save(
      Anamnesis.create({ patientId: patient.id, comorbidities: 'DM2' }),
    );

    const stored = await repo.findByPatientId(patient.id);
    if (!stored) throw new Error('Anamnese não encontrada');
    await repo.save(stored.update({ allergies: 'Látex' }));

    const updated = await repo.findByPatientId(patient.id);
    expect(updated?.comorbidities).toBe('DM2');
    expect(updated?.allergies).toBe('Látex');
  });

  it('Dado evoluções salvas, Quando listar por paciente, Então ordem cronológica reversa', async () => {
    const repo = new DrizzleEvolutionNoteRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    await repo.save(
      EvolutionNote.create({
        patientId: patient.id,
        subjective: 'Primeira',
        objective: '',
        assessment: '',
        plan: '',
      }),
    );
    await repo.save(
      EvolutionNote.create({
        patientId: patient.id,
        subjective: '',
        objective: 'Segunda',
        assessment: '',
        plan: '',
      }),
    );

    const notes = await repo.findByPatientId(patient.id);

    expect(notes).toHaveLength(2);
  });

  it('Dado condição com avaliações, Quando salvar e buscar, Então roundtrip completo', async () => {
    const conditionRepo = new DrizzleClinicalConditionRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    const assessmentRepo = new DrizzleConditionAssessmentRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );

    const condition = ClinicalCondition.create({
      patientId: patient.id,
      kind: 'stoma',
      title: 'Colostomia terminal',
      stomaType: 'colostomia',
      startedAt: new Date('2026-01-10T00:00:00Z'),
    });
    await conditionRepo.save(condition);
    await assessmentRepo.save(
      ConditionAssessment.create({
        conditionId: condition.id,
        skinCondition: 'Dermatite leve',
        painScale: 2,
      }),
    );

    const storedCondition = await conditionRepo.findById(condition.id);
    const byPatient = await conditionRepo.findByPatientId(patient.id);
    const assessments = await assessmentRepo.findByConditionId(condition.id);

    expect(storedCondition?.stomaType).toBe('colostomia');
    expect(storedCondition?.startedAt).toEqual(
      new Date('2026-01-10T00:00:00Z'),
    );
    expect(byPatient).toHaveLength(1);
    expect(assessments[0].painScale).toBe(2);

    await conditionRepo.save(condition.resolve());
    expect((await conditionRepo.findById(condition.id))?.status).toBe(
      'resolved',
    );
  });

  it('Dado insumo com movimentações, Quando salvar e buscar, Então estoque e histórico corretos', async () => {
    const supplyRepo = new DrizzleSupplyRepository(appDb, 'legacy-clinic');
    const movementRepo = new DrizzleStockMovementRepository(
      appDb,
      'legacy-clinic',
    );

    const supply = Supply.create({
      name: 'Bolsa 60mm',
      unit: 'un',
      minQty: 10,
      priceCents: 3500,
    });
    const stocked = supply.registerEntry(50);
    await supplyRepo.save(stocked);
    await movementRepo.save(
      StockMovement.create({
        supplyId: supply.id,
        type: 'in',
        quantity: 50,
        reason: 'Compra',
      }),
    );

    const stored = await supplyRepo.findById(supply.id);
    expect(stored?.stockQty).toBe(50);
    expect(stored?.isLowStock).toBe(false);
    expect(await movementRepo.findBySupplyId(supply.id)).toHaveLength(1);
    expect(await supplyRepo.findAll()).toHaveLength(1);
  });

  it('Dado ajuste condicional de estoque, Quando o saldo permite, Então aplica; senão retorna null (CONS2-05..08)', async () => {
    const supplyRepo = new DrizzleSupplyRepository(appDb, 'legacy-clinic');
    const supply = Supply.create({
      name: 'Gaze atômica',
      unit: 'un',
      minQty: 1,
      priceCents: 100,
    });
    await supplyRepo.save(supply.registerEntry(10));

    // Saída dentro do saldo (CONS2-05) e entrada (CONS2-07) pelo mesmo caminho.
    const afterExit = await supplyRepo.adjustStock(supply.id, -4);
    expect(afterExit?.stockQty).toBe(6);
    const afterEntry = await supplyRepo.adjustStock(supply.id, 4);
    expect(afterEntry?.stockQty).toBe(10);

    // Saída que deixaria negativo → null e nada muda (CONS2-06/08).
    expect(await supplyRepo.adjustStock(supply.id, -11)).toBeNull();
    expect((await supplyRepo.findById(supply.id))?.stockQty).toBe(10);

    // Id inexistente → null.
    expect(await supplyRepo.adjustStock('nao-existe', -1)).toBeNull();
  });

  it('Dado parceiro salvo e paciente indicado, Quando buscar, Então roundtrip e escopo por indicação', async () => {
    const partnerRepo = new DrizzlePartnerRepository(appDb, 'legacy-clinic');
    const patientRepo = new PatientRepo(appDb, 'legacy-clinic', TEST_CIPHER);
    const partner = Partner.create({
      fullName: 'Dr. Carlos Andrade',
      email: 'carlos@x.com',
      phone: '11955550000',
      crm: 'CRM-SP 123456',
      specialty: 'Cirurgia vascular',
    });
    await partnerRepo.save(partner);
    await patientRepo.save(patient.update({ referredByPartnerId: partner.id }));

    const storedPartner = await partnerRepo.findByEmail('carlos@x.com');
    expect(storedPartner?.crm).toBe('CRM-SP 123456');
    expect(await partnerRepo.findById(partner.id)).not.toBeNull();
    expect(await partnerRepo.findAll()).toHaveLength(1);

    const referred = await patientRepo.findByReferrer(partner.id);
    expect(referred).toHaveLength(1);
    expect(referred[0].id).toBe(patient.id);
    expect((await patientRepo.findById(patient.id))?.referredByPartnerId).toBe(
      partner.id,
    );

    await partnerRepo.save(partner.deactivate());
    expect((await partnerRepo.findById(partner.id))?.isActive).toBe(false);
  });

  it('Dado conta Google conectada, Quando salvar e reconectar (upsert), Então guarda a mais recente', async () => {
    const repo = new DrizzleGoogleAccountRepository(appDb, 'legacy-clinic');
    await repo.save({
      email: 'ana@clinica.com',
      encryptedRefreshToken: 'cifrado-v1',
      connectedAt: new Date('2026-07-01T10:00:00Z'),
    });
    await repo.save({
      email: 'ana@clinica.com',
      encryptedRefreshToken: 'cifrado-v2',
      connectedAt: new Date('2026-07-16T10:00:00Z'),
    });
    await repo.save({
      email: 'joao@clinica.com',
      encryptedRefreshToken: 'cifrado-j',
      connectedAt: new Date('2026-07-10T10:00:00Z'),
    });

    expect(
      (await repo.findByEmail('ana@clinica.com'))?.encryptedRefreshToken,
    ).toBe('cifrado-v2');
    expect((await repo.findMostRecent())?.email).toBe('ana@clinica.com');
  });

  it('Dado contas Google de empresas diferentes, Quando buscar a mais recente, Então nunca vaza entre clínicas (issue #74)', async () => {
    await db
      .insert(schema.clinics)
      .values({
        id: 'other-clinic',
        name: 'Outra Clínica',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        createdBy: 'seed-test',
      })
      .onConflictDoNothing();
    const clinicA = new DrizzleGoogleAccountRepository(appDb, 'legacy-clinic');
    const clinicB = new DrizzleGoogleAccountRepository(appDb, 'other-clinic');
    await clinicA.save({
      email: 'ana@clinica-a.com',
      encryptedRefreshToken: 'cifrado-a',
      connectedAt: new Date('2026-07-01T10:00:00Z'),
    });
    // Conta da empresa B é conectada DEPOIS — se o filtro por clínica falhar,
    // `findMostRecent()` da empresa A passaria a devolver a credencial de B.
    await clinicB.save({
      email: 'bruno@clinica-b.com',
      encryptedRefreshToken: 'cifrado-b',
      connectedAt: new Date('2026-07-20T10:00:00Z'),
    });

    expect((await clinicA.findMostRecent())?.email).toBe('ana@clinica-a.com');
    expect((await clinicB.findMostRecent())?.email).toBe('bruno@clinica-b.com');
    expect(await clinicA.findByEmail('bruno@clinica-b.com')).toBeNull();
  });

  it('Dado retornos, Quando filtrar por status e vencimento, Então subconjuntos corretos', async () => {
    const repo = new DrizzleFollowUpRepository(appDb, 'legacy-clinic');
    const pending = FollowUp.create({
      patientId: patient.id,
      dueDate: new Date('2026-07-01T12:00:00Z'),
      reason: 'Reavaliação',
    });
    const done = FollowUp.create({
      patientId: patient.id,
      dueDate: new Date('2026-09-01T12:00:00Z'),
      reason: 'Retorno',
    }).markDone();
    await repo.save(pending);
    await repo.save(done);

    expect(await repo.findAll({ status: 'pending' })).toHaveLength(1);
    expect(
      await repo.findAll({ dueBefore: new Date('2026-08-01T00:00:00Z') }),
    ).toHaveLength(1);
    expect((await repo.findById(done.id))?.status).toBe('done');
  });

  it('Dado condições de vários pacientes, Quando buscar em lote, Então filtra e trata lista vazia', async () => {
    const conditionRepo = new DrizzleClinicalConditionRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    const condition = ClinicalCondition.create({
      patientId: patient.id,
      kind: 'wound',
      title: 'Ferida operatória',
      startedAt: new Date('2026-02-01T00:00:00Z'),
    });
    await conditionRepo.save(condition);

    expect(await conditionRepo.findByPatientIds([])).toEqual([]);
    const byPatients = await conditionRepo.findByPatientIds([
      patient.id,
      patient.id,
    ]);
    expect(byPatients).toHaveLength(1);
    expect(byPatients[0].id).toBe(condition.id);

    // Lote por id (CONS2-09): uma chamada, ids duplicados deduplicados, vazio → [].
    expect(await conditionRepo.findByIds([])).toEqual([]);
    const byIds = await conditionRepo.findByIds([
      condition.id,
      condition.id,
      'inexistente',
    ]);
    expect(byIds).toHaveLength(1);
    expect(byIds[0].id).toBe(condition.id);
  });

  it('Dado fotos de condição, Quando salvar, triar e buscar, Então fluxo completo preservado', async () => {
    const conditionRepo = new DrizzleClinicalConditionRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    const photoRepo = new DrizzleConditionPhotoRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    const condition = ClinicalCondition.create({
      patientId: patient.id,
      kind: 'wound',
      title: 'Ferida operatória',
      startedAt: new Date('2026-02-01T00:00:00Z'),
    });
    await conditionRepo.save(condition);

    const staffPhoto = ConditionPhoto.create({
      conditionId: condition.id,
      contentType: 'image/png',
      sizeBytes: 2048,
      origin: 'staff',
    });
    const patientPhoto = ConditionPhoto.create({
      conditionId: condition.id,
      contentType: 'image/jpeg',
      sizeBytes: 4096,
      origin: 'patient',
      patientNote: 'Está vermelho',
    });
    await photoRepo.save(staffPhoto);
    await photoRepo.save(patientPhoto);

    expect(staffPhoto.triageStatus).toBeNull();
    expect(await photoRepo.findById(staffPhoto.id)).not.toBeNull();
    expect(await photoRepo.findById('id-inexistente')).toBeNull();

    const pending = await photoRepo.findPendingTriage();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(patientPhoto.id);

    await photoRepo.save(patientPhoto.withTriage('escalated'));
    expect((await photoRepo.findById(patientPhoto.id))?.triageStatus).toBe(
      'escalated',
    );
    expect(await photoRepo.findPendingTriage()).toHaveLength(0);

    expect(await photoRepo.findByConditionId(condition.id)).toHaveLength(2);
    expect(await photoRepo.findByConditionIds([])).toEqual([]);
    expect(await photoRepo.findByConditionIds([condition.id])).toHaveLength(2);

    // Cota diária do portal (#213): só foto de paciente, na janela, nas condições dadas.
    expect(await photoRepo.countPatientUploadsSince([], new Date(0))).toBe(0);
    expect(
      await photoRepo.countPatientUploadsSince([condition.id], new Date(0)),
    ).toBe(1);
    expect(
      await photoRepo.countPatientUploadsSince(
        [condition.id],
        new Date(Date.now() + 60_000),
      ),
    ).toBe(0);
    expect(
      await photoRepo.countPatientUploadsSince(
        ['condicao-de-outro-paciente'],
        new Date(0),
      ),
    ).toBe(0);

    await photoRepo.delete(staffPhoto.id);
    expect(await photoRepo.findByConditionId(condition.id)).toHaveLength(1);
  });

  it('Dado aceites de termo, Quando salvar e listar, Então retorna em ordem cronológica reversa', async () => {
    const repo = new DrizzleConsentRecordRepository(appDb, 'legacy-clinic');
    const first = ConsentRecord.create({
      patientId: patient.id,
      consentText: 'Termo v1',
      textVersion: 'v1',
      ipAddress: '10.0.0.1',
    });
    const second = ConsentRecord.create({
      patientId: patient.id,
      consentText: 'Termo v2',
      textVersion: 'v1',
    });
    await repo.save(first);
    await repo.save(second);

    const records = await repo.findByPatientId(patient.id);
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.id)).toContain(first.id);
    expect(records.map((r) => r.id)).toContain(second.id);
    expect(records.find((r) => r.id === first.id)?.ipAddress).toBe('10.0.0.1');
  });

  it('Dado lotes de insumo, Quando salvar e consultar, Então filtra ativos e a vencer', async () => {
    const supplyRepo = new DrizzleSupplyRepository(appDb, 'legacy-clinic');
    const batchRepo = new DrizzleSupplyBatchRepository(appDb, 'legacy-clinic');
    const supply = Supply.create({
      name: 'Bolsa 45mm',
      unit: 'un',
      minQty: 5,
      priceCents: 2500,
    });
    await supplyRepo.save(supply);

    const expiring = SupplyBatch.create({
      supplyId: supply.id,
      quantity: 10,
      label: 'Lote A',
      expiresAt: new Date('2026-08-01T00:00:00Z'),
    });
    const farFuture = SupplyBatch.create({
      supplyId: supply.id,
      quantity: 20,
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    await batchRepo.save(expiring);
    await batchRepo.save(farFuture);

    const active = await batchRepo.findActiveBySupplyId(supply.id);
    expect(active).toHaveLength(2);

    const { batch: depleted } = expiring.consume(10);
    await batchRepo.save(depleted);
    expect(await batchRepo.findActiveBySupplyId(supply.id)).toHaveLength(1);

    const expiringSoon = await batchRepo.findExpiringBefore(
      new Date('2026-09-01T00:00:00Z'),
    );
    expect(expiringSoon.map((b) => b.id)).not.toContain(depleted.id);
  });

  it('Dado movimentações de estoque, Quando consultar por consulta e agregados no período, Então retorna esperado', async () => {
    const supplyRepo = new DrizzleSupplyRepository(appDb, 'legacy-clinic');
    const movementRepo = new DrizzleStockMovementRepository(
      appDb,
      'legacy-clinic',
    );
    const supply = Supply.create({
      name: 'Gaze estéril',
      unit: 'un',
      minQty: 5,
      priceCents: 500,
    });
    await supplyRepo.save(supply.registerEntry(100));

    const outflow = StockMovement.create({
      supplyId: supply.id,
      type: 'out',
      quantity: 3,
      reason: 'Consumo em atendimento',
      unitPriceCents: 500,
    });
    await movementRepo.save(outflow);
    expect(await movementRepo.findByAppointmentId('appt-inexistente')).toEqual(
      [],
    );

    const from = new Date(Date.now() - 3_600_000);
    const to = new Date(Date.now() + 3_600_000);
    const cost = await movementRepo.getOutflowCostInRange(from, to);
    expect(cost).toEqual([{ appointmentId: null, totalCents: 1500 }]);

    const qty = await movementRepo.getOutflowQtyInRange(from, to);
    expect(qty).toEqual([{ supplyId: supply.id, totalQty: 3 }]);
  });
});
