import { describe, expect, it } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import { UserAccount } from '@/domain/auth/user-account';
import { Invoice, type InvoiceState } from '@/domain/billing/invoice';
import { SessionPackage } from '@/domain/billing/package';
import { Procedure } from '@/domain/catalog/procedure';
import { Anamnesis } from '@/domain/clinical/anamnesis';
import {
  ClinicalCondition,
  type ClinicalConditionState,
} from '@/domain/clinical/clinical-condition';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import {
  EvolutionNote,
  type EvolutionNoteState,
} from '@/domain/clinical/evolution-note';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { FollowUp } from '@/domain/followup/follow-up';
import { StockMovement } from '@/domain/inventory/stock-movement';
import { Supply } from '@/domain/inventory/supply';
import { SupplyBatch } from '@/domain/inventory/supply-batch';
import { ReminderLog } from '@/domain/messaging/reminder-log';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import { DEFAULT_SCHEDULE_CONFIG } from '@/domain/scheduling/schedule-config';
import { ValidationError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import {
  InMemoryAnamnesisRepository,
  InMemoryClinicalConditionRepository,
  InMemoryConditionAssessmentRepository,
  InMemoryConditionPhotoRepository,
  InMemoryConsentRecordRepository,
  InMemoryEvolutionNoteRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import {
  InMemoryProcedureKitRepository,
  InMemoryProcedureRepository,
  InMemoryScheduleConfigRepository,
  InMemoryUserAccountRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import {
  InMemoryFollowUpRepository,
  InMemoryStockMovementRepository,
  InMemorySupplyBatchRepository,
  InMemorySupplyRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryPartnerRepository } from '@/infrastructure/persistence/in-memory/in-memory-partner-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryProducedSessionRepository } from '@/infrastructure/persistence/in-memory/in-memory-produced-session-repository';
import { InMemoryProfessionalRepository } from '@/infrastructure/persistence/in-memory/in-memory-professional-repository';
import { InMemoryReminderLogRepository } from '@/infrastructure/persistence/in-memory/in-memory-reminder-log-repository';
import { encodeAuditCursor } from '@/lib/audit-cursor';
import { encodeCursor } from '@/lib/pagination';
import { buildAppointment } from '../support/builders';

describe('Feature: Doubles em memória de infraestrutura', () => {
  describe('Cenário: InMemoryProfessionalRepository', () => {
    it('Dado profissional salvo, Quando buscar por id, Então retorna a mesma entidade', async () => {
      const repo = new InMemoryProfessionalRepository();
      const professional = Professional.create({ fullName: 'Ana Souza' });

      await repo.save(professional);
      const found = await repo.findById(professional.id);

      expect(found?.id).toBe(professional.id);
    });

    it('Dado id inexistente, Quando buscar por id, Então retorna null', async () => {
      const repo = new InMemoryProfessionalRepository();

      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado ids mistos (existentes, repetidos e inexistentes), Quando findByIds, Então retorna só os existentes sem duplicar', async () => {
      const repo = new InMemoryProfessionalRepository();
      const a = Professional.create({ fullName: 'Bruno Lima' });
      const b = Professional.create({ fullName: 'Carla Dias' });
      await repo.save(a);
      await repo.save(b);

      const found = await repo.findByIds([a.id, a.id, b.id, 'nao-existe']);

      expect(found.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    });

    it('Dado vários profissionais, Quando findAll, Então retorna ordenado por nome', async () => {
      const repo = new InMemoryProfessionalRepository();
      await repo.save(Professional.create({ fullName: 'Zeca' }));
      await repo.save(Professional.create({ fullName: 'Ana' }));

      const all = await repo.findAll();

      expect(all.map((p) => p.fullName)).toEqual(['Ana', 'Zeca']);
    });
  });

  describe('Cenário: InMemoryProcedureRepository', () => {
    const makeProcedure = (name: string) =>
      Procedure.create({ name, priceCents: 10000, durationMinutes: 30 });

    it('Dado procedimento salvo, Quando buscar por id, Então retorna a entidade', async () => {
      const repo = new InMemoryProcedureRepository();
      const procedure = makeProcedure('Troca de bolsa');

      await repo.save(procedure);

      expect((await repo.findById(procedure.id))?.name).toBe('Troca de bolsa');
      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado nome com caixa e espaços diferentes, Quando findByName, Então encontra por comparação normalizada', async () => {
      const repo = new InMemoryProcedureRepository();
      await repo.save(makeProcedure('Avaliação'));

      expect((await repo.findByName('AVALIAÇÃO'))?.name).toBe('Avaliação');
      expect(await repo.findByName('inexistente')).toBeNull();
    });

    it('Dado vários procedimentos, Quando findAll, Então retorna ordenado por nome', async () => {
      const repo = new InMemoryProcedureRepository();
      await repo.save(makeProcedure('Zeta'));
      await repo.save(makeProcedure('Alfa'));

      expect((await repo.findAll()).map((p) => p.name)).toEqual([
        'Alfa',
        'Zeta',
      ]);
    });
  });

  describe('Cenário: InMemoryUserAccountRepository', () => {
    const makeAccount = (email: string) =>
      UserAccount.create({
        email,
        passwordHash: 'scrypt$1$salt$hash',
        role: 'company_admin',
        clinicId: 'legacy-clinic',
      });

    it('Dado conta salva, Quando buscar por email (case-insensitive), Então encontra', async () => {
      const repo = new InMemoryUserAccountRepository();
      const account = makeAccount('Ana@Example.com');

      await repo.save(account);

      expect((await repo.findByEmail('ana@example.com'))?.id).toBe(account.id);
    });

    it('Dado email não cadastrado, Quando buscar, Então retorna null', async () => {
      const repo = new InMemoryUserAccountRepository();

      expect(await repo.findByEmail('nao@existe.com')).toBeNull();
    });

    it('Dado hash vigente, Quando upgradePasswordHash, Então troca o hash sem mexer na session_version; hash já trocado, Então não sobrescreve (#208)', async () => {
      const repo = new InMemoryUserAccountRepository();
      const account = makeAccount('upgrade@example.com');
      await repo.save(account);

      await repo.upgradePasswordHash(account.id, 'scrypt$1$outro$hash', 'x');
      expect((await repo.findById(account.id))?.passwordHash).toBe(
        'scrypt$1$salt$hash',
      );

      await repo.upgradePasswordHash(
        account.id,
        'scrypt$1$salt$hash',
        'scrypt$2$novo$hash',
      );
      const upgraded = await repo.findById(account.id);
      expect(upgraded?.passwordHash).toBe('scrypt$2$novo$hash');
      expect(upgraded?.sessionVersion).toBe(account.sessionVersion);

      await repo.upgradePasswordHash('inexistente', 'a', 'b');
    });

    it('Dado várias contas, Quando findAll, Então retorna ordenado por email', async () => {
      const repo = new InMemoryUserAccountRepository();
      await repo.save(makeAccount('zeca@example.com'));
      await repo.save(makeAccount('ana@example.com'));

      expect((await repo.findAll()).map((a) => a.email)).toEqual([
        'ana@example.com',
        'zeca@example.com',
      ]);
    });
  });

  describe('Cenário: InMemoryScheduleConfigRepository', () => {
    it('Dado nenhuma configuração salva, Quando get, Então retorna null', async () => {
      const repo = new InMemoryScheduleConfigRepository();

      expect(await repo.get()).toBeNull();
    });

    it('Dado configuração salva, Quando get, Então retorna os dados salvos; nova gravação sobrescreve (slot único)', async () => {
      const repo = new InMemoryScheduleConfigRepository();

      await repo.save(DEFAULT_SCHEDULE_CONFIG);
      expect(await repo.get()).toEqual(DEFAULT_SCHEDULE_CONFIG);

      const updated = { ...DEFAULT_SCHEDULE_CONFIG, minGapMinutes: 30 };
      await repo.save(updated);
      expect(await repo.get()).toEqual(updated);
    });
  });

  describe('Cenário: InMemoryProcedureKitRepository', () => {
    it('Dado procedimento sem kit, Quando getKit, Então retorna lista vazia', async () => {
      const repo = new InMemoryProcedureKitRepository();

      expect(await repo.getKit('proc-1')).toEqual([]);
    });

    it('Dado kit definido, Quando getKit, Então retorna os itens; novo setKit substitui o kit inteiro', async () => {
      const repo = new InMemoryProcedureKitRepository();

      await repo.setKit('proc-1', [{ supplyId: 'supply-1', quantity: 2 }]);
      expect(await repo.getKit('proc-1')).toEqual([
        { supplyId: 'supply-1', quantity: 2 },
      ]);

      await repo.setKit('proc-1', [{ supplyId: 'supply-2', quantity: 1 }]);
      expect(await repo.getKit('proc-1')).toEqual([
        { supplyId: 'supply-2', quantity: 1 },
      ]);
    });

    it('Dado itens de kit inválidos (insumo repetido), Quando setKit, Então lança ValidationError', async () => {
      const repo = new InMemoryProcedureKitRepository();

      await expect(
        repo.setKit('proc-1', [
          { supplyId: 'supply-1', quantity: 1 },
          { supplyId: 'supply-1', quantity: 2 },
        ]),
      ).rejects.toThrow(ValidationError);
    });

    it('Dado kits de 2 procedimentos e 1 sem kit, Quando countByProcedure, Então conta só os com itens (PROC-03)', async () => {
      const repo = new InMemoryProcedureKitRepository();
      await repo.setKit('proc-1', [
        { supplyId: 'supply-1', quantity: 2 },
        { supplyId: 'supply-2', quantity: 1 },
      ]);
      await repo.setKit('proc-2', [{ supplyId: 'supply-1', quantity: 1 }]);
      await repo.setKit('proc-3', []);

      expect(await repo.countByProcedure()).toEqual({
        'proc-1': 2,
        'proc-2': 1,
      });
    });
  });

  describe('Cenário: InMemoryReminderLogRepository', () => {
    it('Dado lembrete nunca enviado, Quando sentReferences, Então retorna false', async () => {
      const repo = new InMemoryReminderLogRepository();

      expect(
        (
          await repo.sentReferences(
            'confirmation',
            'email',
            ['appt-1'],
            '2026-07-19',
          )
        ).has('appt-1'),
      ).toBe(false);
    });

    it('Dado lembrete salvo, Quando sentReferences no mesmo dia, Então retorna true', async () => {
      const repo = new InMemoryReminderLogRepository();
      const sentAt = new Date('2026-07-19T10:00:00Z');

      await repo.save(ReminderLog.create('confirmation', 'appt-1', sentAt));

      expect(
        (
          await repo.sentReferences(
            'confirmation',
            'email',
            ['appt-1'],
            '2026-07-19',
          )
        ).has('appt-1'),
      ).toBe(true);
      expect(
        (
          await repo.sentReferences('recall', 'email', ['appt-1'], '2026-07-19')
        ).has('appt-1'),
      ).toBe(false);
    });

    it('Dado vários registros, Quando ler em lote, Então devolve o conjunto e o maior número de tentativa por retorno', async () => {
      const repo = new InMemoryReminderLogRepository();
      const day = new Date('2026-07-19T10:00:00Z');
      await repo.save(ReminderLog.create('confirmation', 'a-1', day));
      await repo.save(
        ReminderLog.create('recall', 'fu-1', day, { attempt: 1 }),
      );
      await repo.save(
        ReminderLog.create('recall', 'fu-1', day, { attempt: 2 }),
      );

      expect(
        await repo.sentReferences(
          'confirmation',
          'email',
          ['a-1', 'a-2'],
          '2026-07-19',
        ),
      ).toEqual(new Set(['a-1']));
      expect(await repo.lastRecallAttempts(['fu-1', 'fu-2'])).toEqual(
        new Map([['fu-1', 2]]),
      );
    });

    it('Dado lembrete já registrado, Quando salvar de novo (mesma chave), Então é idempotente e não lança', async () => {
      const repo = new InMemoryReminderLogRepository();
      const sentAt = new Date('2026-07-19T10:00:00Z');

      await repo.save(ReminderLog.create('recall', 'followup-1', sentAt));
      await repo.save(ReminderLog.create('recall', 'followup-1', sentAt));

      expect(
        (
          await repo.sentReferences(
            'recall',
            'email',
            ['followup-1'],
            '2026-07-19',
          )
        ).has('followup-1'),
      ).toBe(true);
      expect(repo.items).toHaveLength(1);
    });

    it('Dado recall por e-mail e cliques de WhatsApp, Quando consultar tentativas, primeiro clique e esgotados, Então separa por canal', async () => {
      const repo = new InMemoryReminderLogRepository();
      const day = new Date('2026-07-19T10:00:00Z');
      const later = new Date('2026-07-19T15:00:00Z');

      await repo.save(
        ReminderLog.create('recall', 'fu-1', day, { attempt: 3 }),
      );
      await repo.save(
        ReminderLog.create('recall', 'fu-2', later, {
          channel: 'whatsapp_link',
        }),
      );
      await repo.save(
        ReminderLog.create('recall', 'fu-2', day, {
          channel: 'whatsapp_link',
        }),
      );

      expect((await repo.lastRecallAttempts(['fu-1'])).get('fu-1') ?? 0).toBe(
        3,
      );
      expect((await repo.lastRecallAttempts(['fu-2'])).get('fu-2') ?? 0).toBe(
        0,
      );
      expect(await repo.exhaustedRecalls(['fu-1', 'fu-2'])).toEqual(
        new Set(['fu-1']),
      );
      const first = await repo.firstSentAt(
        'recall',
        'whatsapp_link',
        ['fu-2'],
        '2026-07-19',
      );
      expect(first.get('fu-2')).toEqual(later);
    });
  });

  describe('Cenário: InMemorySessionPackageRepository', () => {
    it('Dado pacote salvo, Quando buscar por id, Então retorna a entidade; id inexistente retorna null', async () => {
      const repo = new InMemorySessionPackageRepository();
      const pkg = SessionPackage.create({
        patientId: 'patient-1',
        procedureId: 'proc-1',
        totalSessions: 5,
        priceCents: 50000,
      });

      await repo.save(pkg);

      expect((await repo.findById(pkg.id))?.id).toBe(pkg.id);
      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado pacotes de pacientes distintos, Quando findByPatientId, Então retorna só os do paciente', async () => {
      const repo = new InMemorySessionPackageRepository();
      const pkg1 = SessionPackage.create({
        patientId: 'patient-1',
        procedureId: 'proc-1',
        totalSessions: 5,
        priceCents: 50000,
      });
      const pkg2 = SessionPackage.create({
        patientId: 'patient-2',
        procedureId: 'proc-1',
        totalSessions: 3,
        priceCents: 30000,
      });
      await repo.save(pkg1);
      await repo.save(pkg2);

      const found = await repo.findByPatientId('patient-1');

      expect(found.map((p) => p.id)).toEqual([pkg1.id]);
    });

    it('Dado pacote ativo com saldo, Quando findUsable, Então retorna o pacote; sem saldo retorna null', async () => {
      const repo = new InMemorySessionPackageRepository();
      let pkg = SessionPackage.create({
        patientId: 'patient-1',
        procedureId: 'proc-1',
        totalSessions: 1,
        priceCents: 10000,
      });
      await repo.save(pkg);

      expect((await repo.findUsable('patient-1', 'proc-1'))?.id).toBe(pkg.id);
      expect(await repo.findUsable('patient-1', 'proc-outro')).toBeNull();

      pkg = pkg.consumeSession();
      await repo.save(pkg);

      expect(await repo.findUsable('patient-1', 'proc-1')).toBeNull();
    });

    it('Dado consulta ainda não consumida, Quando wasConsumedBy, Então false; após recordConsumption, true (idempotente)', async () => {
      const repo = new InMemorySessionPackageRepository();
      const pkg = SessionPackage.create({
        patientId: 'patient-1',
        procedureId: 'proc-1',
        totalSessions: 3,
        priceCents: 30000,
      });
      await repo.save(pkg);

      expect(await repo.wasConsumedBy('appt-1')).toBe(false);

      await repo.recordConsumption(pkg.id, 'appt-1');
      await repo.recordConsumption('outro-pacote', 'appt-1');

      expect(await repo.wasConsumedBy('appt-1')).toBe(true);
    });
  });

  describe('Cenário: InMemoryAnamnesisRepository', () => {
    it('Dado paciente sem anamnese, Quando findByPatientId, Então retorna null', async () => {
      const repo = new InMemoryAnamnesisRepository();

      expect(await repo.findByPatientId('patient-1')).toBeNull();
    });

    it('Dado anamnese salva, Quando salvar novamente (mesmo paciente), Então upsert por patientId', async () => {
      const repo = new InMemoryAnamnesisRepository();
      const anamnesis = Anamnesis.create({
        patientId: 'patient-1',
        comorbidities: 'DM2',
      });
      await repo.save(anamnesis);

      await repo.save(anamnesis.update({ allergies: 'Látex' }));

      const stored = await repo.findByPatientId('patient-1');
      expect(stored?.comorbidities).toBe('DM2');
      expect(stored?.allergies).toBe('Látex');
    });
  });

  describe('Cenário: InMemoryEvolutionNoteRepository', () => {
    const noteState = (
      overrides: Partial<EvolutionNoteState>,
    ): EvolutionNoteState => ({
      id: overrides.id ?? 'note-x',
      patientId: 'patient-1',
      appointmentId: null,
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
      professionalId: null,
      createdAt: new Date('2026-07-01T00:00:00Z'),
      ...overrides,
    });

    it('Dado evoluções com mesmo createdAt, Quando findByPatientId, Então desempata pela ordem de inserção (mais recente primeiro)', async () => {
      const repo = new InMemoryEvolutionNoteRepository();
      const sameInstant = new Date('2026-07-10T12:00:00Z');
      const first = EvolutionNote.restore(
        noteState({
          id: 'note-1',
          subjective: 'Primeira',
          createdAt: sameInstant,
        }),
      );
      const second = EvolutionNote.restore(
        noteState({
          id: 'note-2',
          subjective: 'Segunda',
          createdAt: sameInstant,
        }),
      );

      await repo.save(first);
      await repo.save(second);

      const notes = await repo.findByPatientId('patient-1');

      expect(notes.map((n) => n.id)).toEqual(['note-2', 'note-1']);
    });

    it('Dado evolução de outro paciente, Quando findByPatientId, Então não retorna', async () => {
      const repo = new InMemoryEvolutionNoteRepository();
      await repo.save(
        EvolutionNote.restore(noteState({ id: 'note-1', patientId: 'outro' })),
      );

      expect(await repo.findByPatientId('patient-1')).toEqual([]);
    });
  });

  describe('Cenário: InMemoryClinicalConditionRepository', () => {
    const conditionState = (
      overrides: Partial<ClinicalConditionState>,
    ): ClinicalConditionState => ({
      id: overrides.id ?? 'cond-x',
      patientId: 'patient-1',
      kind: 'wound',
      title: 'Ferida',
      stomaType: null,
      startedAt: null,
      notes: null,
      status: 'active',
      createdAt: new Date('2026-07-01T00:00:00Z'),
      ...overrides,
    });

    it('Dado condição salva, Quando buscar por id, Então retorna; id inexistente retorna null', async () => {
      const repo = new InMemoryClinicalConditionRepository();
      const condition = ClinicalCondition.restore(
        conditionState({ id: 'cond-1' }),
      );

      await repo.save(condition);

      expect((await repo.findById('cond-1'))?.title).toBe('Ferida');
      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado condições em datas distintas, Quando findByPatientId, Então ordena mais recente primeiro', async () => {
      const repo = new InMemoryClinicalConditionRepository();
      const older = ClinicalCondition.restore(
        conditionState({
          id: 'cond-1',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
      );
      const newer = ClinicalCondition.restore(
        conditionState({
          id: 'cond-2',
          createdAt: new Date('2026-06-01T00:00:00Z'),
        }),
      );
      await repo.save(older);
      await repo.save(newer);

      expect(
        (await repo.findByPatientId('patient-1')).map((c) => c.id),
      ).toEqual(['cond-2', 'cond-1']);
    });

    it('Dado condições de pacientes distintos, Quando findByPatientIds, Então retorna o subconjunto correspondente', async () => {
      const repo = new InMemoryClinicalConditionRepository();
      await repo.save(
        ClinicalCondition.restore(
          conditionState({ id: 'cond-1', patientId: 'p1' }),
        ),
      );
      await repo.save(
        ClinicalCondition.restore(
          conditionState({ id: 'cond-2', patientId: 'p2' }),
        ),
      );
      await repo.save(
        ClinicalCondition.restore(
          conditionState({ id: 'cond-3', patientId: 'p3' }),
        ),
      );

      const found = await repo.findByPatientIds(['p1', 'p2']);

      expect(found.map((c) => c.id).sort()).toEqual(['cond-1', 'cond-2']);
    });

    it('Dado ids de condição, Quando findByIds, Então retorna o lote correspondente (CONS2-09)', async () => {
      const repo = new InMemoryClinicalConditionRepository();
      await repo.save(
        ClinicalCondition.restore(
          conditionState({ id: 'cond-1', patientId: 'p1' }),
        ),
      );
      await repo.save(
        ClinicalCondition.restore(
          conditionState({ id: 'cond-2', patientId: 'p2' }),
        ),
      );

      const found = await repo.findByIds(['cond-2', 'cond-2', 'inexistente']);

      expect(found.map((c) => c.id)).toEqual(['cond-2']);
      expect(await repo.findByIds([])).toEqual([]);
    });
  });

  describe('Cenário: InMemoryConditionAssessmentRepository', () => {
    it('Dado avaliações em datas distintas, Quando findByConditionId, Então ordena mais recente primeiro', async () => {
      const repo = new InMemoryConditionAssessmentRepository();
      const older = ConditionAssessment.create({
        conditionId: 'cond-1',
        painScale: 1,
      });
      const newer = ConditionAssessment.create({
        conditionId: 'cond-1',
        painScale: 5,
      });
      await repo.save(older);
      await repo.save(newer);

      const found = await repo.findByConditionId('cond-1');
      expect(found.map((a) => a.id).sort()).toEqual(
        [older.id, newer.id].sort(),
      );
    });

    it('Dado avaliações de condições distintas, Quando findByConditionIds, Então retorna o subconjunto correspondente', async () => {
      const repo = new InMemoryConditionAssessmentRepository();
      const a1 = ConditionAssessment.create({ conditionId: 'cond-1' });
      const a2 = ConditionAssessment.create({ conditionId: 'cond-2' });
      const a3 = ConditionAssessment.create({ conditionId: 'cond-3' });
      await repo.save(a1);
      await repo.save(a2);
      await repo.save(a3);

      const found = await repo.findByConditionIds(['cond-1', 'cond-2']);

      expect(found.map((a) => a.id).sort()).toEqual([a1.id, a2.id].sort());
    });
  });

  describe('Cenário: InMemoryConditionPhotoRepository', () => {
    it('Dado foto salva, Quando buscar por id, Então retorna; id inexistente retorna null', async () => {
      const repo = new InMemoryConditionPhotoRepository();
      const photo = ConditionPhoto.create({
        conditionId: 'cond-1',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      });

      await repo.save(photo);

      expect((await repo.findById(photo.id))?.conditionId).toBe('cond-1');
      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado fotos de condições distintas, Quando findByConditionId e findByConditionIds, Então filtra corretamente', async () => {
      const repo = new InMemoryConditionPhotoRepository();
      const p1 = ConditionPhoto.create({
        conditionId: 'cond-1',
        contentType: 'image/png',
        sizeBytes: 500,
      });
      const p2 = ConditionPhoto.create({
        conditionId: 'cond-2',
        contentType: 'image/png',
        sizeBytes: 500,
      });
      await repo.save(p1);
      await repo.save(p2);

      expect((await repo.findByConditionId('cond-1')).map((p) => p.id)).toEqual(
        [p1.id],
      );
      expect(
        (await repo.findByConditionIds(['cond-1', 'cond-2']))
          .map((p) => p.id)
          .sort(),
      ).toEqual([p1.id, p2.id].sort());
    });

    it('Dado fotos de origens distintas, Quando findPendingTriage, Então retorna só as pendentes do paciente', async () => {
      const repo = new InMemoryConditionPhotoRepository();
      const fromPatient = ConditionPhoto.create({
        conditionId: 'cond-1',
        contentType: 'image/jpeg',
        sizeBytes: 800,
        origin: 'patient',
      });
      const fromStaff = ConditionPhoto.create({
        conditionId: 'cond-1',
        contentType: 'image/jpeg',
        sizeBytes: 800,
        origin: 'staff',
      });
      await repo.save(fromPatient);
      await repo.save(fromStaff);

      const pending = await repo.findPendingTriage();

      expect(pending.map((p) => p.id)).toEqual([fromPatient.id]);
    });

    it('Dado foto salva, Quando remover, Então some do repositório; remover id inexistente não lança', async () => {
      const repo = new InMemoryConditionPhotoRepository();
      const photo = ConditionPhoto.create({
        conditionId: 'cond-1',
        contentType: 'image/jpeg',
        sizeBytes: 500,
      });
      await repo.save(photo);

      await repo.delete(photo.id);

      expect(await repo.findById(photo.id)).toBeNull();
      await expect(repo.delete('nao-existe')).resolves.toBeUndefined();
    });
  });

  describe('Cenário: InMemoryConsentRecordRepository', () => {
    it('Dado registros de consentimento salvos, Quando findByPatientId, Então ordena mais recente primeiro', async () => {
      const repo = new InMemoryConsentRecordRepository();
      const first = ConsentRecord.create({
        patientId: 'patient-1',
        consentText: 'Termo v1',
        textVersion: 'v1',
      });
      await repo.save(first);
      const second = ConsentRecord.create({
        patientId: 'patient-1',
        consentText: 'Termo v2',
        textVersion: 'v1',
      });
      await repo.save(second);

      const found = await repo.findByPatientId('patient-1');

      expect(found).toHaveLength(2);
      expect(found.map((r) => r.id).sort()).toEqual(
        [first.id, second.id].sort(),
      );
    });

    it('Dado paciente sem registros, Quando findByPatientId, Então retorna lista vazia', async () => {
      const repo = new InMemoryConsentRecordRepository();

      expect(await repo.findByPatientId('sem-registros')).toEqual([]);
    });
  });

  describe('Cenário: InMemoryAuditEventRepository', () => {
    // AuditEvent.create carimba occurredAt = agora, o que deixaria os cenários de
    // ordenação e de janela de datas sem instantes distintos para discriminar.
    // restore permite controlar o instante — é o que esses cenários exigem.
    let auditSeq = 0;
    const makeEvent = (patientId: string, occurredAt: Date) => {
      auditSeq += 1;
      return AuditEvent.restore({
        id: `audit-${auditSeq}`,
        clinicId: 'clinic-1',
        actorRole: 'admin',
        actorId: 'staff',
        action: 'read',
        resourceType: 'anamnesis',
        resourceId: 'res-1',
        patientId,
        detail: null,
        occurredAt,
      });
    };

    it('Dado eventos de pacientes distintos, Quando findAll sem filtro, Então retorna todos ordenados mais recente primeiro', async () => {
      const repo = new InMemoryAuditEventRepository();
      const older = new Date('2026-03-01T10:00:00.000Z');
      const newer = new Date('2026-03-02T10:00:00.000Z');
      // Gravados fora de ordem de propósito: se findAll devolvesse na ordem de
      // inserção, a asserção abaixo falharia.
      await repo.save(makeEvent('patient-1', older));
      await repo.save(makeEvent('patient-2', newer));

      const all = await repo.findAll();

      expect(all).toHaveLength(2);
      expect(all.map((e) => e.patientId)).toEqual(['patient-2', 'patient-1']);
      expect(all.map((e) => e.occurredAt)).toEqual([newer, older]);
    });

    it('Dado eventos de pacientes distintos, Quando filtrar por patientId, Então retorna só os do paciente', async () => {
      const repo = new InMemoryAuditEventRepository();
      await repo.save(makeEvent('patient-1', new Date()));
      await repo.save(makeEvent('patient-2', new Date()));

      const found = await repo.findAll({ patientId: 'patient-1' });

      expect(found).toHaveLength(1);
      expect(found[0].patientId).toBe('patient-1');
    });

    it('Dado eventos e paginação, Quando limit, Então retorna a página correta', async () => {
      const repo = new InMemoryAuditEventRepository();
      await repo.save(makeEvent('patient-1', new Date()));
      await repo.save(makeEvent('patient-1', new Date()));
      await repo.save(makeEvent('patient-1', new Date()));

      expect(await repo.findAll({}, { limit: 2 })).toHaveLength(2);
    });

    it('Dado janela de datas, Quando filtrar por from/to, Então respeita os limites (from inclusivo, to exclusivo)', async () => {
      const repo = new InMemoryAuditEventRepository();
      const at = new Date('2026-03-01T10:00:00.000Z');
      await repo.save(makeEvent('patient-1', at));

      // O próprio instante entra em `from` e fica de fora de `to`.
      expect(await repo.findAll({ from: at })).toHaveLength(1);
      expect(await repo.findAll({ to: at })).toHaveLength(0);
      expect(
        await repo.findAll({ from: new Date(at.getTime() + 1) }),
      ).toHaveLength(0);
      expect(
        await repo.findAll({ to: new Date(at.getTime() + 1) }),
      ).toHaveLength(1);
    });
  });

  describe('Cenário: auditoria escopada por empresa (B6)', () => {
    const event = (clinicId: string | null, actorRole = 'company_admin') =>
      AuditEvent.create({
        clinicId,
        actorRole,
        actorId: 'x',
        action: 'update',
        resourceType: 'clinic-info',
        resourceId: 'r',
      });

    it('Dado repositórios por escopo sobre o mesmo store, Quando save/findAll/findPlatformTrail (auditoria escopada), Então seguem as regras do Drizzle', async () => {
      const store: AuditEvent[] = [];
      const system = new InMemoryAuditEventRepository(null, store);
      const clinicA = new InMemoryAuditEventRepository('clinic-a', store);
      const clinicB = new InMemoryAuditEventRepository('clinic-b', store);

      await system.save(event(null, 'anonymous'));
      await clinicA.save(event(null, 'super_admin'));
      await clinicA.save(event('clinic-a'));
      await clinicB.save(event('clinic-b'));
      await expect(clinicA.save(event('clinic-b'))).rejects.toThrow(
        'Evento de auditoria de outra empresa',
      );

      expect((await clinicA.findAll()).map((e) => e.clinicId)).toEqual([
        'clinic-a',
        'clinic-a',
      ]);
      expect(await system.findAll()).toHaveLength(4);
      expect(
        (await system.findPlatformTrail()).map((e) => [
          e.clinicId,
          e.actorRole,
        ]),
      ).toEqual(
        expect.arrayContaining([
          [null, 'anonymous'],
          ['clinic-a', 'super_admin'],
        ]),
      );
      expect(await system.findPlatformTrail()).toHaveLength(2);
      expect(
        await system.findPlatformTrail({ from: new Date(Date.now() + 60_000) }),
      ).toHaveLength(0);
      expect(await system.findPlatformTrail({}, { limit: 1 })).toHaveLength(1);
      await expect(clinicA.findPlatformTrail()).rejects.toThrow(
        'Trilha de plataforma exige escopo de sistema',
      );
    });

    it('Dados eventos em instantes distintos, Quando consultar a trilha de plataforma (auditoria escopada), Então mais recente primeiro, com período e cursor como no Drizzle (C9)', async () => {
      const t = (min: number) => new Date(Date.UTC(2026, 8, 27, 12, min));
      const at = (
        id: string,
        clinicId: string | null,
        actorRole: string,
        occurredAt: Date,
      ) =>
        AuditEvent.restore({
          id,
          clinicId,
          actorRole,
          actorId: `${actorRole}@x.test`,
          action: 'update',
          resourceType: 'clinic-info',
          resourceId: `r-${id}`,
          patientId: null,
          detail: null,
          occurredAt,
        });
      const system = new InMemoryAuditEventRepository(null);
      // Gravados do mais antigo ao mais novo: a ordem de inserção é a inversa
      // da esperada, então só uma ordenação real passa.
      for (const e of [
        at('anonymous', null, 'anonymous', t(1)),
        at('super-in-a', 'clinic-a', 'super_admin', t(2)),
        at('admin-in-a', 'clinic-a', 'company_admin', t(3)),
        at('super-no-clinic', null, 'super_admin', t(4)),
      ]) {
        await system.save(e);
      }
      const ids = (events: AuditEvent[]) => events.map((e) => e.id);

      expect(ids(await system.findPlatformTrail())).toEqual([
        'super-no-clinic',
        'super-in-a',
        'anonymous',
      ]);
      expect(
        ids(await system.findPlatformTrail({ from: t(2), to: t(4) })),
      ).toEqual(['super-in-a']);
      const afterFirst = encodeAuditCursor(
        at('super-no-clinic', null, 'super_admin', t(4)),
      );
      expect(
        ids(await system.findPlatformTrail({}, { cursor: afterFirst })),
      ).toEqual(['super-in-a', 'anonymous']);
      expect(
        ids(
          await system.findPlatformTrail({}, { limit: 1, cursor: afterFirst }),
        ),
      ).toEqual(['super-in-a']);
    });
  });

  describe('Cenário: InMemorySupplyRepository', () => {
    it('Dado insumo salvo, Quando buscar por id, Então retorna; id inexistente retorna null', async () => {
      const repo = new InMemorySupplyRepository();
      const supply = Supply.create({
        name: 'Bolsa 60mm',
        unit: 'un',
        minQty: 10,
        priceCents: 3500,
      });

      await repo.save(supply);

      expect((await repo.findById(supply.id))?.name).toBe('Bolsa 60mm');
      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado vários insumos, Quando findAll, Então retorna ordenado por nome', async () => {
      const repo = new InMemorySupplyRepository();
      await repo.save(
        Supply.create({ name: 'Zeta', unit: 'un', minQty: 1, priceCents: 100 }),
      );
      await repo.save(
        Supply.create({ name: 'Alfa', unit: 'un', minQty: 1, priceCents: 100 }),
      );

      expect((await repo.findAll()).map((s) => s.name)).toEqual([
        'Alfa',
        'Zeta',
      ]);
    });

    it('Dado ajuste condicional, Quando saldo permite aplica; senão null (CONS2-05..08)', async () => {
      const repo = new InMemorySupplyRepository();
      const supply = Supply.create({
        name: 'Gaze',
        unit: 'un',
        minQty: 1,
        priceCents: 100,
      });
      await repo.save(supply.registerEntry(5));

      expect((await repo.adjustStock(supply.id, -3))?.stockQty).toBe(2);
      expect((await repo.adjustStock(supply.id, 1))?.stockQty).toBe(3);
      expect(await repo.adjustStock(supply.id, -4)).toBeNull();
      expect((await repo.findById(supply.id))?.stockQty).toBe(3);
      expect(await repo.adjustStock('nao-existe', 1)).toBeNull();
    });
  });

  describe('Cenário: InMemoryStockMovementRepository', () => {
    it('Dado movimentações de insumos distintos, Quando findBySupplyId, Então retorna só as do insumo', async () => {
      const repo = new InMemoryStockMovementRepository();
      const m1 = StockMovement.create({
        supplyId: 's1',
        type: 'in',
        quantity: 10,
        reason: 'Compra',
      });
      const m2 = StockMovement.create({
        supplyId: 's2',
        type: 'in',
        quantity: 5,
        reason: 'Compra',
      });
      await repo.save(m1);
      await repo.save(m2);

      expect((await repo.findBySupplyId('s1')).map((m) => m.id)).toEqual([
        m1.id,
      ]);
    });

    it('Dado movimentações vinculadas a consultas, Quando findByAppointmentId, Então retorna as vinculadas', async () => {
      const repo = new InMemoryStockMovementRepository();
      const linked = StockMovement.create({
        supplyId: 's1',
        type: 'out',
        quantity: 2,
        reason: 'Atendimento',
        appointmentId: 'appt-1',
      });
      const unlinked = StockMovement.create({
        supplyId: 's1',
        type: 'in',
        quantity: 20,
        reason: 'Compra',
      });
      await repo.save(linked);
      await repo.save(unlinked);

      expect(
        (await repo.findByAppointmentId('appt-1')).map((m) => m.id),
      ).toEqual([linked.id]);
    });

    it('Dado saídas com custo em uma janela, Quando getOutflowCostInRange, Então soma por consulta ignorando entradas e fora do período', async () => {
      const repo = new InMemoryStockMovementRepository();
      await repo.save(
        StockMovement.create({
          supplyId: 's1',
          type: 'out',
          quantity: 2,
          reason: 'Atendimento',
          appointmentId: 'appt-1',
          unitPriceCents: 500,
        }),
      );
      await repo.save(
        StockMovement.create({
          supplyId: 's1',
          type: 'in',
          quantity: 100,
          reason: 'Compra',
        }),
      );

      const from = new Date(Date.now() - 60_000);
      const to = new Date(Date.now() + 60_000);
      const totals = await repo.getOutflowCostInRange(from, to);

      expect(totals).toEqual([{ appointmentId: 'appt-1', totalCents: 1000 }]);
      expect(
        await repo.getOutflowCostInRange(new Date(0), new Date(1)),
      ).toEqual([]);
    });

    it('Dado saídas de insumos em uma janela, Quando getOutflowQtyInRange, Então soma quantidade por insumo', async () => {
      const repo = new InMemoryStockMovementRepository();
      await repo.save(
        StockMovement.create({
          supplyId: 's1',
          type: 'out',
          quantity: 3,
          reason: 'Uso',
        }),
      );
      await repo.save(
        StockMovement.create({
          supplyId: 's1',
          type: 'out',
          quantity: 2,
          reason: 'Uso',
        }),
      );

      const from = new Date(Date.now() - 60_000);
      const to = new Date(Date.now() + 60_000);
      const totals = await repo.getOutflowQtyInRange(from, to);

      expect(totals).toEqual([{ supplyId: 's1', totalQty: 5 }]);
    });
  });

  describe('Cenário: InMemorySupplyBatchRepository', () => {
    it('Dado lotes com e sem validade, Quando findActiveBySupplyId, Então ordena por validade (FEFO) e ignora esgotados', async () => {
      const repo = new InMemorySupplyBatchRepository();
      const noExpiry = SupplyBatch.create({ supplyId: 's1', quantity: 10 });
      const expiresSoon = SupplyBatch.create({
        supplyId: 's1',
        quantity: 5,
        expiresAt: new Date('2026-08-01T00:00:00Z'),
      });
      const { batch: exhausted } = SupplyBatch.create({
        supplyId: 's1',
        quantity: 3,
      }).consume(3);
      await repo.save(noExpiry);
      await repo.save(expiresSoon);
      await repo.save(exhausted);

      const active = await repo.findActiveBySupplyId('s1');

      expect(active.map((b) => b.id)).toEqual([expiresSoon.id, noExpiry.id]);
    });

    it('Dado lotes vencendo, Quando findExpiringBefore, Então retorna só os com saldo e dentro do limite', async () => {
      const repo = new InMemorySupplyBatchRepository();
      const expiring = SupplyBatch.create({
        supplyId: 's1',
        quantity: 5,
        expiresAt: new Date('2026-07-20T00:00:00Z'),
      });
      const farFuture = SupplyBatch.create({
        supplyId: 's1',
        quantity: 5,
        expiresAt: new Date('2027-01-01T00:00:00Z'),
      });
      await repo.save(expiring);
      await repo.save(farFuture);

      const found = await repo.findExpiringBefore(
        new Date('2026-08-01T00:00:00Z'),
      );

      expect(found.map((b) => b.id)).toEqual([expiring.id]);
    });
  });

  describe('Cenário: InMemoryFollowUpRepository', () => {
    it('Dado retorno salvo, Quando buscar por id, Então retorna; id inexistente retorna null', async () => {
      const repo = new InMemoryFollowUpRepository();
      const followUp = FollowUp.create({
        patientId: 'patient-1',
        dueDate: new Date('2026-08-01T00:00:00Z'),
        reason: 'Reavaliação',
      });

      await repo.save(followUp);

      expect((await repo.findById(followUp.id))?.reason).toBe('Reavaliação');
      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado retornos variados, Quando findAll sem filtro, Então ordena por data de vencimento', async () => {
      const repo = new InMemoryFollowUpRepository();
      const later = FollowUp.create({
        patientId: 'patient-1',
        dueDate: new Date('2026-09-01T00:00:00Z'),
        reason: 'Retorno tardio',
      });
      const sooner = FollowUp.create({
        patientId: 'patient-1',
        dueDate: new Date('2026-07-25T00:00:00Z'),
        reason: 'Retorno próximo',
      });
      await repo.save(later);
      await repo.save(sooner);

      expect((await repo.findAll()).map((f) => f.id)).toEqual([
        sooner.id,
        later.id,
      ]);
    });

    it('Dado retornos com status e pacientes distintos, Quando filtrar, Então respeita status, patientId e dueBefore', async () => {
      const repo = new InMemoryFollowUpRepository();
      const pending = FollowUp.create({
        patientId: 'patient-1',
        dueDate: new Date('2026-07-20T00:00:00Z'),
        reason: 'A',
      });
      const done = FollowUp.create({
        patientId: 'patient-2',
        dueDate: new Date('2026-09-01T00:00:00Z'),
        reason: 'B',
      }).markDone();
      await repo.save(pending);
      await repo.save(done);

      expect(
        (await repo.findAll({ status: 'pending' })).map((f) => f.id),
      ).toEqual([pending.id]);
      expect(
        (await repo.findAll({ patientId: 'patient-2' })).map((f) => f.id),
      ).toEqual([done.id]);
      expect(
        (
          await repo.findAll({ dueBefore: new Date('2026-08-01T00:00:00Z') })
        ).map((f) => f.id),
      ).toEqual([pending.id]);
    });
  });

  describe('Cenário: InMemoryPartnerRepository', () => {
    const makePartner = (fullName: string, email: string) =>
      Partner.create({ fullName, email, phone: '11955550000' });

    it('Dado parceiro salvo, Quando buscar por id, Então retorna; id inexistente retorna null', async () => {
      const repo = new InMemoryPartnerRepository();
      const partner = makePartner('Dr. Carlos', 'carlos@x.com');

      await repo.save(partner);

      expect((await repo.findById(partner.id))?.fullName).toBe('Dr. Carlos');
      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado parceiro salvo, Quando buscar por email normalizado, Então encontra; email inexistente retorna null', async () => {
      const repo = new InMemoryPartnerRepository();
      await repo.save(makePartner('Dra. Ana', 'Ana@X.com'));

      expect((await repo.findByEmail('ana@x.com'))?.fullName).toBe('Dra. Ana');
      expect(await repo.findByEmail('nao@existe.com')).toBeNull();
    });

    it('Dado vários parceiros, Quando findAll, Então retorna ordenado por nome', async () => {
      const repo = new InMemoryPartnerRepository();
      await repo.save(makePartner('Zeca', 'zeca@x.com'));
      await repo.save(makePartner('Ana', 'ana2@x.com'));

      expect((await repo.findAll()).map((p) => p.fullName)).toEqual([
        'Ana',
        'Zeca',
      ]);
    });
  });

  describe('Cenário: InMemoryInvoiceRepository', () => {
    const invoiceState = (overrides: Partial<InvoiceState>): InvoiceState => ({
      id: overrides.id ?? 'inv-x',
      patientId: 'patient-1',
      description: 'Consulta',
      amount: Money.fromCents(10000),
      appointmentId: null,
      dueDate: null,
      status: 'pending',
      issuedAt: new Date('2026-07-01T00:00:00Z'),
      paidAt: null,
      paymentMethod: null,
      ...overrides,
    });

    it('Dado fatura salva, Quando buscar por id, Então retorna; id inexistente retorna null', async () => {
      const repo = new InMemoryInvoiceRepository();
      const invoice = Invoice.restore(invoiceState({ id: 'inv-1' }));

      await repo.save(invoice);

      expect((await repo.findById('inv-1'))?.description).toBe('Consulta');
      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado fatura vinculada a consulta, Quando findByAppointmentId, Então retorna; sem vínculo retorna null', async () => {
      const repo = new InMemoryInvoiceRepository();
      await repo.save(
        Invoice.restore(invoiceState({ id: 'inv-1', appointmentId: 'appt-1' })),
      );

      expect((await repo.findByAppointmentId('appt-1'))?.id).toBe('inv-1');
      expect(await repo.findByAppointmentId('nao-existe')).toBeNull();
    });

    it('Dado faturas em datas distintas, Quando findAll sem filtro, Então ordena emissão mais recente primeiro', async () => {
      const repo = new InMemoryInvoiceRepository();
      const older = Invoice.restore(
        invoiceState({
          id: 'inv-1',
          issuedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      );
      const newer = Invoice.restore(
        invoiceState({
          id: 'inv-2',
          issuedAt: new Date('2026-06-01T00:00:00Z'),
        }),
      );
      await repo.save(older);
      await repo.save(newer);

      expect((await repo.findAll()).map((i) => i.id)).toEqual([
        'inv-2',
        'inv-1',
      ]);
    });

    it('Dado faturas variadas, Quando filtrar por status, patientId e período, Então retorna o subconjunto correto', async () => {
      const repo = new InMemoryInvoiceRepository();
      const pending = Invoice.restore(
        invoiceState({
          id: 'inv-1',
          status: 'pending',
          patientId: 'p1',
          issuedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      );
      const paid = Invoice.restore(
        invoiceState({
          id: 'inv-2',
          status: 'paid',
          patientId: 'p2',
          issuedAt: new Date('2026-06-01T00:00:00Z'),
        }),
      );
      await repo.save(pending);
      await repo.save(paid);

      expect((await repo.findAll({ status: 'paid' })).map((i) => i.id)).toEqual(
        ['inv-2'],
      );
      expect(
        (await repo.findAll({ patientId: 'p1' })).map((i) => i.id),
      ).toEqual(['inv-1']);
      expect(
        (await repo.findAll({ from: new Date('2026-05-01T00:00:00Z') })).map(
          (i) => i.id,
        ),
      ).toEqual(['inv-2']);
      expect(
        (await repo.findAll({ to: new Date('2026-02-01T00:00:00Z') })).map(
          (i) => i.id,
        ),
      ).toEqual(['inv-1']);
    });

    it('Dado várias faturas, Quando paginar (limit/cursor), Então retorna a página correta', async () => {
      const repo = new InMemoryInvoiceRepository();
      await repo.save(
        Invoice.restore(
          invoiceState({
            id: 'inv-1',
            issuedAt: new Date('2026-01-01T00:00:00Z'),
          }),
        ),
      );
      await repo.save(
        Invoice.restore(
          invoiceState({
            id: 'inv-2',
            issuedAt: new Date('2026-02-01T00:00:00Z'),
          }),
        ),
      );
      await repo.save(
        Invoice.restore(
          invoiceState({
            id: 'inv-3',
            issuedAt: new Date('2026-03-01T00:00:00Z'),
          }),
        ),
      );

      const firstPage = await repo.findAll(undefined, { limit: 2 });
      expect(firstPage.map((i) => i.id)).toEqual(['inv-3', 'inv-2']);

      const cursor = encodeCursor({
        issuedAt: firstPage[1].issuedAt.toISOString(),
        id: firstPage[1].id,
      });
      expect(
        (await repo.findAll(undefined, { cursor })).map((i) => i.id),
      ).toEqual(['inv-1']);
    });

    it('Dado faturas pagas, pendentes e canceladas, Quando summarize, Então soma centavos e contagens corretamente', async () => {
      const repo = new InMemoryInvoiceRepository();
      await repo.save(
        Invoice.restore(
          invoiceState({
            id: 'inv-1',
            status: 'paid',
            amount: Money.fromCents(1000),
          }),
        ),
      );
      await repo.save(
        Invoice.restore(
          invoiceState({
            id: 'inv-2',
            status: 'pending',
            amount: Money.fromCents(2000),
          }),
        ),
      );
      await repo.save(
        Invoice.restore(
          invoiceState({
            id: 'inv-3',
            status: 'cancelled',
            amount: Money.fromCents(3000),
          }),
        ),
      );

      const summary = await repo.summarize();

      expect(summary).toEqual({
        paidCents: 1000,
        pendingCents: 2000,
        totalInvoices: 3,
        paidCount: 1,
        pendingCount: 1,
        cancelledCount: 1,
      });
    });
  });

  describe('Cenário: InMemoryAppointmentRepository', () => {
    const slot = (startIso: string, endIso: string) =>
      TimeSlot.create(new Date(startIso), new Date(endIso));
    const makeAppointment = (
      patientId: string,
      startIso: string,
      endIso: string,
      price = 20000,
    ) =>
      buildAppointment({
        patientId,
        slot: slot(startIso, endIso),
        price: Money.fromCents(price),
      });

    it('Dado consulta salva, Quando buscar por id, Então retorna; id inexistente retorna null', async () => {
      const repo = new InMemoryAppointmentRepository();
      const appointment = makeAppointment(
        'patient-1',
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );

      await repo.save(appointment);

      expect((await repo.findById(appointment.id))?.patientId).toBe(
        'patient-1',
      );
      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado ids mistos, Quando findByIds, Então retorna só existentes sem duplicar', async () => {
      const repo = new InMemoryAppointmentRepository();
      const a = makeAppointment(
        'patient-1',
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      await repo.save(a);

      const found = await repo.findByIds([a.id, a.id, 'nao-existe']);

      expect(found.map((x) => x.id)).toEqual([a.id]);
    });

    it('Dado consultas do paciente, Quando findByPatientId com endsAfter, Então filtra e ordena por início', async () => {
      const repo = new InMemoryAppointmentRepository();
      const earlier = makeAppointment(
        'patient-1',
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      const later = makeAppointment(
        'patient-1',
        '2026-08-20T09:00:00Z',
        '2026-08-20T10:00:00Z',
      );
      await repo.save(later);
      await repo.save(earlier);

      const all = await repo.findByPatientId('patient-1');
      expect(all.map((a) => a.id)).toEqual([earlier.id, later.id]);

      const future = await repo.findByPatientId('patient-1', {
        endsAfter: new Date('2026-08-01T00:00:00Z'),
      });
      expect(future.map((a) => a.id)).toEqual([later.id]);
    });

    it('Dado consultas de pacientes distintos, Quando findByPatientIds, Então retorna o subconjunto correspondente', async () => {
      const repo = new InMemoryAppointmentRepository();
      const a1 = makeAppointment(
        'p1',
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
      );
      const a2 = makeAppointment(
        'p2',
        '2026-07-21T09:00:00Z',
        '2026-07-21T10:00:00Z',
      );
      const a3 = makeAppointment(
        'p3',
        '2026-07-22T09:00:00Z',
        '2026-07-22T10:00:00Z',
      );
      await repo.save(a1);
      await repo.save(a2);
      await repo.save(a3);

      const found = await repo.findByPatientIds(['p1', 'p2']);

      expect(found.map((a) => a.id).sort()).toEqual([a1.id, a2.id].sort());
    });

    it('Dado consultas concluídas e outras, Quando getStatsInRange, Então agrega status e receita por procedimento', async () => {
      const repo = new InMemoryAppointmentRepository();
      const completed = makeAppointment(
        'p1',
        '2026-07-20T09:00:00Z',
        '2026-07-20T10:00:00Z',
        25000,
      ).complete();
      const cancelled = makeAppointment(
        'p1',
        '2026-07-20T11:00:00Z',
        '2026-07-20T12:00:00Z',
      ).cancel();
      await repo.save(completed);
      await repo.save(cancelled);

      const stats = await repo.getStatsInRange(
        new Date('2026-07-20T00:00:00Z'),
        new Date('2026-07-21T00:00:00Z'),
      );

      expect(stats.byStatus.completed).toBe(1);
      expect(stats.byStatus.cancelled).toBe(1);
      expect(stats.revenueByProcedure).toEqual([
        { procedure: 'Troca de bolsa', count: 1, totalCents: 25000 },
      ]);
    });

    it('Dado consultas de profissionais distintos, Quando findInRange com professionalId, Então filtra', async () => {
      const repo = new InMemoryAppointmentRepository();
      const withProf = buildAppointment({
        patientId: 'p1',
        slot: slot('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z'),
        professionalId: 'prof-1',
      });
      const withoutProf = makeAppointment(
        'p1',
        '2026-07-20T11:00:00Z',
        '2026-07-20T12:00:00Z',
      );
      await repo.save(withProf);
      await repo.save(withoutProf);

      const filtered = await repo.findInRange(
        new Date('2026-07-20T00:00:00Z'),
        new Date('2026-07-21T00:00:00Z'),
        { professionalId: 'prof-1' },
      );

      expect(filtered.map((a) => a.id)).toEqual([withProf.id]);
    });

    it('Dada consulta concluída e outra agendada, Quando ler sessões produzidas, Então só a concluída entra', async () => {
      const repo = new InMemoryAppointmentRepository();
      const completed = buildAppointment({
        patientId: 'p1',
        slot: slot('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z'),
        professionalId: 'prof-1',
      }).complete();
      const scheduled = buildAppointment({
        patientId: 'p1',
        slot: slot('2026-07-20T11:00:00Z', '2026-07-20T12:00:00Z'),
        professionalId: 'prof-1',
      });
      await repo.save(completed);
      await repo.save(scheduled);

      const sessions = await new InMemoryProducedSessionRepository(
        repo,
        new InMemoryInvoiceRepository(),
        new InMemorySessionPackageRepository(),
      ).findCompletedInRange(
        new Date('2026-07-20T00:00:00Z'),
        new Date('2026-07-21T00:00:00Z'),
      );

      expect(
        sessions.map((s) => [
          s.appointmentId,
          s.professionalId,
          s.listPriceCents,
        ]),
      ).toEqual([[completed.id, 'prof-1', 25000]]);
    });

    it('Dado consulta ativa, Quando findConflicting, Então respeita exclusão de id, status inativo e profissionais distintos', async () => {
      const repo = new InMemoryAppointmentRepository();
      const active = buildAppointment({
        patientId: 'p1',
        slot: slot('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z'),
        professionalId: 'prof-1',
      });
      await repo.save(active);

      const overlap = slot('2026-07-20T09:30:00Z', '2026-07-20T10:30:00Z');

      expect(await repo.findConflicting(overlap)).toHaveLength(1);
      expect(await repo.findConflicting(overlap, active.id)).toHaveLength(0);
      expect(
        await repo.findConflicting(overlap, undefined, 'prof-2'),
      ).toHaveLength(0);
      expect(
        await repo.findConflicting(overlap, undefined, 'prof-1'),
      ).toHaveLength(1);

      await repo.save(active.cancel());
      expect(await repo.findConflicting(overlap)).toHaveLength(0);
    });
  });

  describe('Cenário: InMemoryPatientRepository', () => {
    const makePatient = (
      fullName: string,
      email: string,
      phone = '11999990000',
    ) => Patient.create({ fullName, email, phone });

    it('Dado paciente salvo, Quando buscar por id, Então retorna; id inexistente retorna null', async () => {
      const repo = new InMemoryPatientRepository();
      const patient = makePatient('Maria da Silva', 'maria@example.com');

      await repo.save(patient);

      expect((await repo.findById(patient.id))?.fullName).toBe(
        'Maria da Silva',
      );
      expect(await repo.findById('nao-existe')).toBeNull();
    });

    it('Dado paciente salvo, Quando buscar pelo email, Então a busca ignora caixa; sem e-mail não quebra a busca (#325)', async () => {
      const repo = new InMemoryPatientRepository();
      await repo.save(makePatient('Maria da Silva', 'Maria@Example.com'));
      await repo.save(
        Patient.create({ fullName: 'Sem Email', phone: '11999990000' }),
      );

      expect((await repo.findAll('maria@example.com'))[0]?.fullName).toBe(
        'Maria da Silva',
      );
      expect(await repo.findAll('nao@existe.com')).toHaveLength(0);
    });

    it('Dado pacientes indicados por parceiros distintos, Quando findByReferrer, Então retorna só os indicados por ele', async () => {
      const repo = new InMemoryPatientRepository();
      const referred = makePatient(
        'Paciente Indicado',
        'indicado@example.com',
      ).update({
        referredByPartnerId: 'partner-1',
      });
      const direct = makePatient('Paciente Direto', 'direto@example.com');
      await repo.save(referred);
      await repo.save(direct);

      const found = await repo.findByReferrer('partner-1');

      expect(found.map((p) => p.id)).toEqual([referred.id]);
    });

    it('Dado ids mistos, Quando findByIds, Então retorna só existentes sem duplicar', async () => {
      const repo = new InMemoryPatientRepository();
      const a = makePatient('Ana', 'ana@example.com');
      await repo.save(a);

      const found = await repo.findByIds([a.id, a.id, 'nao-existe']);

      expect(found.map((p) => p.id)).toEqual([a.id]);
    });

    it('Dado vários pacientes, Quando findAll sem busca, Então retorna ordenado por nome', async () => {
      const repo = new InMemoryPatientRepository();
      await repo.save(makePatient('Zeca', 'zeca@example.com'));
      await repo.save(makePatient('Ana', 'ana@example.com'));

      expect((await repo.findAll()).map((p) => p.fullName)).toEqual([
        'Ana',
        'Zeca',
      ]);
    });

    it('Dado termo de busca, Quando findAll, Então encontra por nome, email ou telefone', async () => {
      const repo = new InMemoryPatientRepository();
      await repo.save(
        makePatient('Maria da Silva', 'maria@example.com', '11988887777'),
      );

      expect(await repo.findAll('mari')).toHaveLength(1);
      expect(await repo.findAll('example.com')).toHaveLength(1);
      expect(await repo.findAll('988887777')).toHaveLength(1);
      expect(await repo.findAll('inexistente')).toHaveLength(0);
    });

    it('Dado vários pacientes, Quando paginar (limit/cursor), Então retorna a página correta', async () => {
      const repo = new InMemoryPatientRepository();
      await repo.save(makePatient('Ana', 'ana@example.com'));
      await repo.save(makePatient('Bruno', 'bruno@example.com'));
      await repo.save(makePatient('Carla', 'carla@example.com'));

      const firstPage = await repo.findAll(undefined, { limit: 2 });
      expect(firstPage.map((p) => p.fullName)).toEqual(['Ana', 'Bruno']);

      const cursor = encodeCursor({
        fullName: firstPage[1].fullName,
        id: firstPage[1].id,
      });
      expect(
        (await repo.findAll(undefined, { cursor })).map((p) => p.fullName),
      ).toEqual(['Carla']);
    });
  });
});
