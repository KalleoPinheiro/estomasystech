import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import { SessionPackage } from '@/domain/billing/package';
import { Procedure } from '@/domain/catalog/procedure';
import { ReminderLog } from '@/domain/messaging/reminder-log';
import { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAuditEventRepository } from '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository';
import { DrizzleProcedureRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import { DrizzleGoogleAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-google-account-repository';
import { DrizzleSessionPackageRepository } from '@/infrastructure/persistence/drizzle/drizzle-package-repository';
import { DrizzlePartnerRepository } from '@/infrastructure/persistence/drizzle/drizzle-partner-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleProfessionalRepository } from '@/infrastructure/persistence/drizzle/drizzle-professional-repository';
import { DrizzleReminderLogRepository } from '@/infrastructure/persistence/drizzle/drizzle-reminder-log-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

describe('Feature: Persistência PostgreSQL — auditoria, pacotes, equipe e integrações', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let patient: Patient;
  let procedure: Procedure;

  const auditRepo = () =>
    new DrizzleAuditEventRepository(appDb, 'legacy-clinic');
  const packageRepo = () =>
    new DrizzleSessionPackageRepository(appDb, 'legacy-clinic');
  const professionalRepo = () =>
    new DrizzleProfessionalRepository(appDb, 'legacy-clinic');
  const reminderLogRepo = () =>
    new DrizzleReminderLogRepository(appDb, 'legacy-clinic');
  const googleAccountRepo = () =>
    new DrizzleGoogleAccountRepository(appDb, 'legacy-clinic');
  const partnerRepo = () =>
    new DrizzlePartnerRepository(appDb, 'legacy-clinic');

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;
  });

  beforeEach(async () => {
    await db.delete(schema.packageConsumptions);
    await db.delete(schema.sessionPackages);
    await db.delete(schema.auditEvents);
    await db.delete(schema.reminderLogs);
    await db.delete(schema.googleAccounts);
    await db.delete(schema.professionals);
    await db.delete(schema.partners);
    await db.delete(schema.procedures);
    await db.delete(schema.patients);

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

    procedure = Procedure.create({
      name: 'Consulta de enfermagem',
      priceCents: 15000,
      durationMinutes: 40,
    });
    await new DrizzleProcedureRepository(appDb, 'legacy-clinic').save(
      procedure,
    );
  });

  describe('Cenário: eventos de auditoria (append-only)', () => {
    it('Dado evento salvo, Quando buscar, Então campos preservados', async () => {
      const repo = auditRepo();
      const event = AuditEvent.create({
        clinicId: 'legacy-clinic',
        actorRole: 'admin',
        actorId: 'staff',
        action: 'read',
        resourceType: 'anamnesis',
        resourceId: 'res-1',
        patientId: patient.id,
        detail: 'Visualizou anamnese',
      });
      await repo.save(event);

      const [stored] = await repo.findAll();

      expect(stored.id).toBe(event.id);
      expect(stored.actorRole).toBe('admin');
      expect(stored.action).toBe('read');
      expect(stored.resourceType).toBe('anamnesis');
      expect(stored.patientId).toBe(patient.id);
      expect(stored.detail).toBe('Visualizou anamnese');
    });

    it('Dado eventos de pacientes distintos, Quando filtrar por patientId, Então retorna só os do paciente', async () => {
      const repo = auditRepo();
      await repo.save(
        AuditEvent.create({
          clinicId: 'legacy-clinic',
          actorRole: 'admin',
          actorId: 'staff',
          action: 'read',
          resourceType: 'anamnesis',
          resourceId: 'res-1',
          patientId: patient.id,
        }),
      );
      await repo.save(
        AuditEvent.create({
          clinicId: 'legacy-clinic',
          actorRole: 'admin',
          actorId: 'staff',
          action: 'create',
          resourceType: 'evolution',
          resourceId: 'res-2',
        }),
      );

      const filtered = await repo.findAll({ patientId: patient.id });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].resourceId).toBe('res-1');
      expect(await repo.findAll()).toHaveLength(2);
    });

    it('Dado eventos recentes, Quando filtrar por período, Então respeita from e to', async () => {
      const repo = auditRepo();
      await repo.save(
        AuditEvent.create({
          clinicId: 'legacy-clinic',
          actorRole: 'admin',
          actorId: 'staff',
          action: 'update',
          resourceType: 'condition',
          resourceId: 'res-3',
        }),
      );

      const future = new Date(Date.now() + 86_400_000);
      const past = new Date(Date.now() - 86_400_000);

      expect(await repo.findAll({ from: future })).toHaveLength(0);
      expect(await repo.findAll({ from: past })).toHaveLength(1);
      expect(await repo.findAll({ to: past })).toHaveLength(0);
      expect(await repo.findAll({ to: future })).toHaveLength(1);
    });

    it('Dado vários eventos, Quando paginar, Então respeita limit', async () => {
      const repo = auditRepo();
      for (let i = 0; i < 3; i += 1) {
        await repo.save(
          AuditEvent.create({
            clinicId: 'legacy-clinic',
            actorRole: 'admin',
            actorId: 'staff',
            action: 'read',
            resourceType: 'anamnesis',
            resourceId: `res-${i}`,
          }),
        );
      }

      expect(await repo.findAll({}, { limit: 2 })).toHaveLength(2);
    });
  });

  describe('Cenário: pacotes de sessões pré-pagas', () => {
    const createPackage = (totalSessions = 3) =>
      SessionPackage.create({
        patientId: patient.id,
        procedureId: procedure.id,
        totalSessions,
        priceCents: 90000,
      });

    it('Dado pacote salvo, Quando buscar por id, Então campos preservados', async () => {
      const repo = packageRepo();
      const pkg = createPackage();
      await repo.save(pkg);

      const stored = await repo.findById(pkg.id);
      expect(stored?.totalSessions).toBe(3);
      expect(stored?.usedSessions).toBe(0);
      expect(stored?.priceCents).toBe(90000);
      expect(stored?.isActive).toBe(true);
    });

    it('Dado id inexistente, Quando buscar, Então retorna null', async () => {
      expect(await packageRepo().findById('id-inexistente')).toBeNull();
    });

    it('Dado pacote consumido, Quando salvar de novo (upsert), Então atualiza usedSessions', async () => {
      const repo = packageRepo();
      const pkg = createPackage();
      await repo.save(pkg);

      await repo.save(pkg.consumeSession());

      const stored = await repo.findById(pkg.id);
      expect(stored?.usedSessions).toBe(1);
    });

    it('Dado pacotes do paciente, Quando listar, Então retorna todos ordenados', async () => {
      const repo = packageRepo();
      await repo.save(createPackage());
      await repo.save(createPackage());

      expect(await repo.findByPatientId(patient.id)).toHaveLength(2);
    });

    it('Dado pacote ativo com saldo, Quando buscar usável, Então encontra; sem saldo, então null', async () => {
      const repo = packageRepo();
      const pkg = createPackage(1);
      await repo.save(pkg);

      const usable = await repo.findUsable(patient.id, procedure.id);
      expect(usable?.id).toBe(pkg.id);

      await repo.save(pkg.consumeSession());
      expect(await repo.findUsable(patient.id, procedure.id)).toBeNull();
    });

    it('Dado pacote com validade, Quando salvar e buscar, Então expiresAt preservado e expirado não é usável (COMP3-07/08)', async () => {
      const repo = packageRepo();
      const expired = SessionPackage.create({
        patientId: patient.id,
        procedureId: procedure.id,
        totalSessions: 3,
        priceCents: 90000,
        expiresAt: new Date('2020-01-01T00:00:00Z'),
      });
      await repo.save(expired);

      expect((await repo.findById(expired.id))?.expiresAt?.toISOString()).toBe(
        '2020-01-01T00:00:00.000Z',
      );
      expect(await repo.findUsable(patient.id, procedure.id)).toBeNull();

      const valid = SessionPackage.create({
        patientId: patient.id,
        procedureId: procedure.id,
        totalSessions: 3,
        priceCents: 90000,
        expiresAt: new Date('2030-01-01T00:00:00Z'),
      });
      await repo.save(valid);
      expect((await repo.findUsable(patient.id, procedure.id))?.id).toBe(
        valid.id,
      );
    });

    it('Dado consumo registrado, Quando verificar por consulta, Então idempotente e rastreável', async () => {
      const repo = packageRepo();
      const pkg = createPackage();
      await repo.save(pkg);

      expect(await repo.wasConsumedBy('appt-1')).toBe(false);

      await repo.recordConsumption(pkg.id, 'appt-1');
      await repo.recordConsumption(pkg.id, 'appt-1');

      expect(await repo.wasConsumedBy('appt-1')).toBe(true);
    });
  });

  describe('Cenário: profissionais da equipe', () => {
    const createProfessional = () =>
      Professional.create({
        fullName: 'Ana Enfermeira',
        registry: 'COREN-SP 123456',
        commissionPct: 30,
      });

    it('Dado profissional salvo, Quando buscar por id, Então campos preservados', async () => {
      const repo = professionalRepo();
      const professional = createProfessional();
      await repo.save(professional);

      const stored = await repo.findById(professional.id);
      expect(stored?.fullName).toBe('Ana Enfermeira');
      expect(stored?.registry).toBe('COREN-SP 123456');
      expect(stored?.commissionPct).toBe(30);
      expect(stored?.isActive).toBe(true);
    });

    it('Dado id inexistente, Quando buscar, Então retorna null', async () => {
      expect(await professionalRepo().findById('id-inexistente')).toBeNull();
    });

    it('Dado profissional desativado, Quando salvar (upsert), Então persiste inatividade', async () => {
      const repo = professionalRepo();
      const professional = createProfessional();
      await repo.save(professional);

      await repo.save(professional.deactivate());

      expect((await repo.findById(professional.id))?.isActive).toBe(false);
    });

    it('Dado ids vazios, Quando buscar em lote, Então retorna array vazio sem consultar banco', async () => {
      expect(await professionalRepo().findByIds([])).toEqual([]);
    });

    it('Dado profissionais salvos, Quando buscar por ids e listar todos, Então retorna esperado', async () => {
      const repo = professionalRepo();
      const a = createProfessional();
      const b = Professional.create({ fullName: 'Bruno Técnico' });
      await repo.save(a);
      await repo.save(b);

      const byIds = await repo.findByIds([a.id, a.id, b.id]);
      expect(byIds).toHaveLength(2);
      expect(await repo.findAll()).toHaveLength(2);
    });
  });

  describe('Cenário: log de lembretes enviados', () => {
    it('Dado lembrete salvo, Quando verificar envio, Então idempotente por dia', async () => {
      const repo = reminderLogRepo();
      const sentAt = new Date('2026-07-15T09:00:00Z');
      const log = ReminderLog.create('confirmation', 'appt-1', sentAt);

      await repo.save(log);
      await repo.save(ReminderLog.create('confirmation', 'appt-1', sentAt));

      expect(
        (
          await repo.sentReferences(
            'confirmation',
            'email',
            ['appt-1'],
            '2026-07-15',
          )
        ).has('appt-1'),
      ).toBe(true);
      expect(
        (
          await repo.sentReferences('recall', 'email', ['appt-1'], '2026-07-15')
        ).has('appt-1'),
      ).toBe(false);
      expect(
        (
          await repo.sentReferences(
            'confirmation',
            'email',
            ['appt-1'],
            '2026-07-16',
          )
        ).has('appt-1'),
      ).toBe(false);
    });
  });

  describe('Cenário: conta Google — casos não encontrados', () => {
    it('Dado email não cadastrado, Quando buscar, Então retorna null', async () => {
      expect(await googleAccountRepo().findByEmail('ninguem@x.com')).toBeNull();
    });

    it('Dado nenhuma conta conectada, Quando buscar mais recente, Então retorna null', async () => {
      expect(await googleAccountRepo().findMostRecent()).toBeNull();
    });
  });

  describe('Cenário: parceiros — casos não encontrados', () => {
    it('Dado id inexistente, Quando buscar por id, Então retorna null', async () => {
      expect(await partnerRepo().findById('id-inexistente')).toBeNull();
    });

    it('Dado email não cadastrado, Quando buscar por email, Então retorna null', async () => {
      expect(await partnerRepo().findByEmail('ninguem@x.com')).toBeNull();
    });
  });
});
