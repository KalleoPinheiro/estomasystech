import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import { FollowUp } from '@/domain/followup/follow-up';
import { ReminderLog } from '@/domain/messaging/reminder-log';
import { Patient } from '@/domain/patient/patient';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzleFollowUpRepository } from '@/infrastructure/persistence/drizzle/drizzle-inventory-repositories';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleReminderLogRepository } from '@/infrastructure/persistence/drizzle/drizzle-reminder-log-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC_A = 'legacy-clinic';
const CLINIC_B = 'clinic-reminders-b';
const MIGRATION = path.join(
  process.cwd(),
  'drizzle',
  '0037_reminder-logs-channel-attempt.sql',
);

describe('Feature: reminder_logs por canal e tentativa (PostgreSQL)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;

  const repoA = () => new DrizzleReminderLogRepository(appDb, CLINIC_A);
  const repoB = () => new DrizzleReminderLogRepository(appDb, CLINIC_B);
  const rows = () => db.select().from(schema.reminderLogs);

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;
    await new DrizzleClinicRepository(appDb).create(
      Clinic.restore({
        id: CLINIC_B,
        name: 'Clínica Beta',
        createdBy: 'test',
        createdAt: new Date('2030-01-01T00:00:00Z'),
      }),
    );
  });

  beforeEach(async () => {
    await db.delete(schema.reminderLogs);
    await db.delete(schema.followUps);
  });

  it('C2 save grava channel, attempt e clinic_id da empresa', async () => {
    await repoB().save(
      ReminderLog.create('recall', 'fu-1', new Date('2026-07-16T12:00:00Z'), {
        attempt: 2,
      }),
    );
    await repoA().save(
      ReminderLog.create(
        'confirmation',
        'appt-1',
        new Date('2026-07-16T12:00:00Z'),
        { channel: 'whatsapp_link' },
      ),
    );

    const saved = await rows();
    expect(
      saved
        .map((r) => [r.clinicId, r.kind, r.channel, r.attempt, r.sentOn])
        .sort(),
    ).toEqual(
      [
        [CLINIC_B, 'recall', 'email', 2, '2026-07-16'],
        [CLINIC_A, 'confirmation', 'whatsapp_link', 1, '2026-07-16'],
      ].sort(),
    );
  });

  it('Dado escopo de sistema, Quando salvar, Então recusa em vez de cair na clínica legada', async () => {
    await expect(
      new DrizzleReminderLogRepository(appDb, null).save(
        ReminderLog.create('confirmation', 'appt-1'),
      ),
    ).rejects.toThrow(/exige empresa/);
    expect(await rows()).toHaveLength(0);
  });

  it('C18 índices únicos parciais', async () => {
    const day1 = new Date('2026-07-16T09:00:00Z');
    const day1Later = new Date('2026-07-16T15:00:00Z');
    const day2 = new Date('2026-07-20T09:00:00Z');
    const repo = repoA();

    // Confirmação por e-mail: uma por dia; remarcada (mesmo id) recebe outra em outro dia.
    await repo.save(ReminderLog.create('confirmation', 'appt-1', day1));
    await repo.save(ReminderLog.create('confirmation', 'appt-1', day1Later));
    await repo.save(ReminderLog.create('confirmation', 'appt-1', day2));
    // whatsapp_link: um por dia por referência, independente do e-mail.
    for (const at of [day1, day1Later, day2]) {
      await repo.save(
        ReminderLog.create('recall', 'fu-1', at, { channel: 'whatsapp_link' }),
      );
    }
    // Recall por e-mail: um por tentativa, mesmo em dias diferentes.
    await repo.save(ReminderLog.create('recall', 'fu-1', day1, { attempt: 1 }));
    await repo.save(ReminderLog.create('recall', 'fu-1', day2, { attempt: 1 }));
    await repo.save(ReminderLog.create('recall', 'fu-1', day2, { attempt: 2 }));

    const saved = await rows();
    const count = (kind: string, channel: string) =>
      saved.filter((r) => r.kind === kind && r.channel === channel).length;
    expect(count('confirmation', 'email')).toBe(2);
    expect(count('recall', 'whatsapp_link')).toBe(2);
    expect(count('recall', 'email')).toBe(2);
    expect((await repo.lastRecallAttempts(['fu-1'])).get('fu-1') ?? 0).toBe(2);
    expect(
      (
        await repo.sentReferences(
          'confirmation',
          'email',
          ['appt-1'],
          '2026-07-20',
        )
      ).has('appt-1'),
    ).toBe(true);
    expect(
      (
        await repo.sentReferences(
          'confirmation',
          'whatsapp_link',
          ['appt-1'],
          '2026-07-20',
        )
      ).has('appt-1'),
    ).toBe(false);
  });

  it('Dado cliques e tentativas, Quando ler primeiro clique e esgotados, Então filtra por empresa e canal', async () => {
    const first = new Date('2026-07-16T09:05:00Z');
    await repoA().save(
      ReminderLog.create('recall', 'fu-1', first, { channel: 'whatsapp_link' }),
    );
    await repoA().save(
      ReminderLog.create('recall', 'fu-1', new Date('2026-07-16T10:00:00Z'), {
        channel: 'whatsapp_link',
      }),
    );
    await repoA().save(
      ReminderLog.create('recall', 'fu-2', first, { attempt: 3 }),
    );
    await repoB().save(
      ReminderLog.create('recall', 'fu-b', first, { attempt: 3 }),
    );

    const sent = await repoA().firstSentAt(
      'recall',
      'whatsapp_link',
      ['fu-1', 'fu-2', 'fu-b'],
      '2026-07-16',
    );
    expect([...sent]).toEqual([['fu-1', first]]);
    expect(await repoA().exhaustedRecalls(['fu-1', 'fu-2', 'fu-b'])).toEqual(
      new Set(['fu-2']),
    );
    expect(await repoA().exhaustedRecalls([])).toEqual(new Set());
    expect(
      await repoA().firstSentAt('recall', 'whatsapp_link', [], '2026-07-16'),
    ).toEqual(new Map());
    expect((await repoB().lastRecallAttempts(['fu-2'])).get('fu-2') ?? 0).toBe(
      0,
    );
  });

  it('Dado vários retornos e consultas, Quando ler em lote, Então devolve só os da empresa e do canal pedidos', async () => {
    const day = new Date('2026-07-16T09:00:00Z');
    await repoA().save(ReminderLog.create('confirmation', 'a-1', day));
    await repoA().save(
      ReminderLog.create('confirmation', 'a-2', day, {
        channel: 'whatsapp_link',
      }),
    );
    await repoB().save(ReminderLog.create('confirmation', 'a-3', day));
    await repoA().save(
      ReminderLog.create('recall', 'fu-1', day, { attempt: 1 }),
    );
    await repoA().save(
      ReminderLog.create('recall', 'fu-1', day, { attempt: 2 }),
    );
    await repoA().save(
      ReminderLog.create('recall', 'fu-2', day, { attempt: 1 }),
    );
    await repoB().save(
      ReminderLog.create('recall', 'fu-3', day, { attempt: 3 }),
    );

    expect(
      await repoA().sentReferences(
        'confirmation',
        'email',
        ['a-1', 'a-2', 'a-3', 'a-4'],
        '2026-07-16',
      ),
    ).toEqual(new Set(['a-1']));
    expect(
      await repoA().sentReferences('confirmation', 'email', [], '2026-07-16'),
    ).toEqual(new Set());
    expect(
      await repoA().lastRecallAttempts(['fu-1', 'fu-2', 'fu-3', 'fu-4']),
    ).toEqual(
      new Map([
        ['fu-1', 2],
        ['fu-2', 1],
      ]),
    );
    expect(await repoA().lastRecallAttempts([])).toEqual(new Map());
  });

  it('C18 backfill numera tentativas do recall existente', async () => {
    // Estado anterior à 0037: recall diário gravado várias vezes por retorno.
    await db.execute(sql.raw('DROP INDEX "uq_reminder_logs_daily"'));
    await db.execute(sql.raw('DROP INDEX "uq_reminder_logs_recall_attempt"'));
    await db.execute(
      sql.raw(`INSERT INTO "reminder_logs" (id, clinic_id, kind, reference_id, sent_on, created_at) VALUES
        ('r3','${CLINIC_A}','recall','fu-old','2026-05-03', now()),
        ('r1','${CLINIC_A}','recall','fu-old','2026-05-01', now()),
        ('r2','${CLINIC_A}','recall','fu-old','2026-05-02', now()),
        ('r4','${CLINIC_A}','recall','fu-new','2026-05-02', now()),
        ('c1','${CLINIC_A}','confirmation','appt-old','2026-05-02', now())`),
    );

    const statements = fs
      .readFileSync(MIGRATION, 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => /^(-- .*\n)*(UPDATE|CREATE UNIQUE INDEX)/.test(s));
    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }

    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(
      ['r1', 'r2', 'r3', 'r4', 'c1'].map((id) => byId.get(id)?.attempt),
    ).toEqual([1, 2, 3, 1, 1]);
    expect([...byId.values()].every((r) => r.channel === 'email')).toBe(true);
    expect(await repoA().exhaustedRecalls(['fu-old', 'fu-new'])).toEqual(
      new Set(['fu-old']),
    );
  });

  it('C11 findPendingDueBefore devolve os 501 sem corte', async () => {
    const patient = Patient.create({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    await new DrizzlePatientRepository(appDb, CLINIC_A, TEST_CIPHER).save(
      patient,
    );
    const followUps = new DrizzleFollowUpRepository(appDb, CLINIC_A);
    const due = new Date('2026-07-01T12:00:00Z');
    const values = Array.from({ length: 501 }, () => {
      const followUp = FollowUp.create({
        patientId: patient.id,
        appointmentId: null,
        dueDate: due,
        reason: 'Retorno',
      });
      return {
        id: followUp.id,
        clinicId: CLINIC_A,
        patientId: patient.id,
        appointmentId: null,
        dueDate: due,
        reason: 'Retorno',
        status: 'pending',
        createdAt: due,
      };
    });
    await db.insert(schema.followUps).values(values);
    const other = FollowUp.create({
      patientId: patient.id,
      appointmentId: null,
      dueDate: due,
      reason: 'Retorno',
    });
    await new DrizzleFollowUpRepository(appDb, CLINIC_B).save(other);

    const pending = await followUps.findPendingDueBefore(
      new Date('2026-07-16T00:00:00Z'),
    );

    expect(pending).toHaveLength(501);
    expect(pending.some((f) => f.id === other.id)).toBe(false);
    expect(await followUps.findAll({ status: 'pending' })).toHaveLength(500);
  });

  it('Dado empresas cadastradas, Quando listar, Então devolve todas em ordem de criação', async () => {
    const all = await new DrizzleClinicRepository(appDb).findAll();

    expect(all.map((c) => c.id)).toContain(CLINIC_A);
    expect(all.at(-1)?.id).toBe(CLINIC_B);
  });
});
