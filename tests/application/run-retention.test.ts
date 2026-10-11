import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import {
  CLINIC_RETENTION_FAILED,
  type ClinicRetentionServices,
  PATIENT_BATCH,
  PHOTO_BATCH,
  PLATFORM_RETENTION_FAILED,
  RETENTION_ACTOR,
  RunRetention,
} from '@/application/retention/run-retention';
import type { AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { RetentionRepository } from '@/domain/retention/retention-repository';

const NOW = new Date('2026-10-11T12:00:00Z');

function fakeRetention(
  overrides: Partial<RetentionRepository> = {},
): RetentionRepository {
  return {
    findPatientsDue: vi.fn(async () => []),
    anonymizePatient: vi.fn(async () => 1),
    findPendingPhotos: vi.fn(async () => []),
    markPhotoAnonymized: vi.fn(async () => undefined),
    anonymizeAuditEvents: vi.fn(async () => 0),
    anonymizeWaitlistEntries: vi.fn(async () => 0),
    anonymizeInactiveAccounts: vi.fn(async () => 0),
    ...overrides,
  };
}

function fakeAudit() {
  const saved: AuditEvent[] = [];
  const repo: AuditEventRepository = {
    save: vi.fn(async (event: AuditEvent) => {
      saved.push(event);
    }),
    findAll: vi.fn(async () => []),
    findPlatformTrail: vi.fn(async () => []),
  };
  return { repo, saved };
}

function fakeStorage(failing: string[] = []): PhotoStorage & {
  removed: string[];
} {
  const removed: string[] = [];
  return {
    removed,
    write: vi.fn(async () => undefined),
    read: vi.fn(async () => null),
    remove: vi.fn(async (id: string) => {
      if (failing.includes(id)) throw new Error('disco indisponível');
      removed.push(id);
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Feature: Job de retenção (#294)', () => {
  it('Dada uma clínica com dado vencido de todos os tipos, Quando roda, Então anonimiza com os cortes certos, conta por tipo e audita só as contagens', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const retention = fakeRetention({
      findPatientsDue: vi.fn(async () => ['p1', 'p2', 'p3']),
      anonymizePatient: vi.fn(async (id: string) => (id === 'p3' ? 0 : 1)),
      findPendingPhotos: vi.fn(async () => [{ id: 'f1' }, { id: 'f2' }]),
      anonymizeAuditEvents: vi.fn(async () => 7),
      anonymizeWaitlistEntries: vi.fn(async () => 2),
      anonymizeInactiveAccounts: vi.fn(async () => 1),
    });
    const storage = fakeStorage(['f2']);
    const audit = fakeAudit();
    const platformRetention = fakeRetention({
      anonymizeAuditEvents: vi.fn(async () => 4),
    });
    const platformAudit = fakeAudit();

    const summary = await new RunRetention(
      ['c1'],
      async () => ({
        retention,
        photoStorage: storage,
        auditEvents: audit.repo,
      }),
      async () => ({
        retention: platformRetention,
        auditEvents: platformAudit.repo,
      }),
      NOW,
    ).execute();

    expect(retention.findPatientsDue).toHaveBeenCalledWith(
      new Date('2006-10-11T12:00:00Z'),
      PATIENT_BATCH,
    );
    expect(retention.findPendingPhotos).toHaveBeenCalledWith(PHOTO_BATCH);
    expect(retention.anonymizeAuditEvents).toHaveBeenCalledWith(
      new Date('2021-10-11T12:00:00Z'),
    );
    expect(retention.anonymizeWaitlistEntries).toHaveBeenCalledWith(
      new Date('2024-10-11T12:00:00Z'),
    );
    expect(retention.anonymizeInactiveAccounts).toHaveBeenCalledWith(
      new Date('2024-10-11T12:00:00Z'),
      NOW,
    );
    // Arquivo que falhou não é marcado: volta na próxima execução (RET-04).
    expect(storage.removed).toEqual(['f1']);
    expect(retention.markPhotoAnonymized).toHaveBeenCalledTimes(1);
    expect(retention.markPhotoAnonymized).toHaveBeenCalledWith('f1', NOW);

    const counts = {
      clinicalRecords: 2,
      photos: 1,
      auditEvents: 7,
      waitlistEntries: 2,
      accounts: 1,
    };
    expect(summary).toEqual({
      ...counts,
      auditEvents: 11,
      platform: { auditEvents: 4 },
      clinics: [{ clinicId: 'c1', ...counts }],
    });

    expect(audit.saved).toHaveLength(1);
    expect(audit.saved[0]).toMatchObject({
      clinicId: 'c1',
      actorRole: 'system',
      actorId: RETENTION_ACTOR,
      action: 'update',
      resourceType: 'retention',
      resourceId: '2026-10-11',
      patientId: null,
    });
    expect(JSON.parse(audit.saved[0].detail ?? '')).toEqual(counts);
    expect(platformAudit.saved).toHaveLength(1);
    expect(platformAudit.saved[0]).toMatchObject({ clinicId: null });
    expect(JSON.parse(platformAudit.saved[0].detail ?? '')).toEqual({
      clinicalRecords: 0,
      photos: 0,
      auditEvents: 4,
      waitlistEntries: 0,
      accounts: 0,
    });
  });

  it('Dado nada vencido, Quando roda, Então não grava evento de auditoria (RET-09)', async () => {
    const audit = fakeAudit();
    const platformAudit = fakeAudit();

    const summary = await new RunRetention(
      ['c1'],
      async () => ({
        retention: fakeRetention(),
        photoStorage: fakeStorage(),
        auditEvents: audit.repo,
      }),
      async () => ({
        retention: fakeRetention(),
        auditEvents: platformAudit.repo,
      }),
      NOW,
    ).execute();

    expect(summary.clinics).toEqual([
      {
        clinicId: 'c1',
        clinicalRecords: 0,
        photos: 0,
        auditEvents: 0,
        waitlistEntries: 0,
        accounts: 0,
      },
    ]);
    expect(audit.saved).toEqual([]);
    expect(platformAudit.saved).toEqual([]);
  });

  it('Dada uma clínica que falha, Quando roda, Então ela traz o erro e as outras e a plataforma seguem (RET-10)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const healthy = fakeRetention({
      anonymizeWaitlistEntries: vi.fn(async () => 3),
    });
    const services = (clinicId: string): Promise<ClinicRetentionServices> => {
      if (clinicId === 'bad') {
        return Promise.resolve({
          retention: fakeRetention({
            findPatientsDue: vi.fn(async () => {
              throw new Error('banco fora');
            }),
          }),
          photoStorage: fakeStorage(),
          auditEvents: fakeAudit().repo,
        });
      }
      return Promise.resolve({
        retention: healthy,
        photoStorage: fakeStorage(),
        auditEvents: fakeAudit().repo,
      });
    };

    const summary = await new RunRetention(
      ['bad', 'good'],
      services,
      async () => {
        throw new Error('sistema fora');
      },
      NOW,
    ).execute();

    expect(summary.clinics).toEqual([
      {
        clinicId: 'bad',
        clinicalRecords: 0,
        photos: 0,
        auditEvents: 0,
        waitlistEntries: 0,
        accounts: 0,
        error: CLINIC_RETENTION_FAILED,
      },
      {
        clinicId: 'good',
        clinicalRecords: 0,
        photos: 0,
        auditEvents: 0,
        waitlistEntries: 3,
        accounts: 0,
      },
    ]);
    expect(summary.platform).toEqual({
      auditEvents: 0,
      error: PLATFORM_RETENTION_FAILED,
    });
    expect(summary.waitlistEntries).toBe(3);
  });

  it('Dada falha no meio da clínica, Quando roda, Então a resposta e a trilha trazem o que já foi anonimizado (RET-10)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const audit = fakeAudit();
    const retention = fakeRetention({
      findPatientsDue: vi.fn(async () => ['p1', 'p2']),
      anonymizeAuditEvents: vi.fn(async () => 5),
      anonymizeWaitlistEntries: vi.fn(async () => {
        throw new Error('select * from waitlist_entries where ...');
      }),
    });

    const summary = await new RunRetention(
      ['c1'],
      async () => ({
        retention,
        photoStorage: fakeStorage(),
        auditEvents: audit.repo,
      }),
      async () => ({
        retention: fakeRetention(),
        auditEvents: fakeAudit().repo,
      }),
      NOW,
    ).execute();

    expect(retention.anonymizePatient).toHaveBeenCalledWith(
      'p1',
      NOW,
      new Date('2006-10-11T12:00:00Z'),
    );
    const partial = {
      clinicalRecords: 2,
      photos: 0,
      auditEvents: 5,
      waitlistEntries: 0,
      accounts: 0,
    };
    expect(summary.clinics).toEqual([
      { clinicId: 'c1', ...partial, error: CLINIC_RETENTION_FAILED },
    ]);
    expect(audit.saved).toHaveLength(1);
    expect(JSON.parse(audit.saved[0].detail ?? '')).toEqual(partial);
  });

  it('Dada falha também ao auditar o parcial, Quando roda, Então a resposta segue com o erro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const audit = fakeAudit();
    vi.mocked(audit.repo.save).mockRejectedValue(new Error('trilha fora'));

    const summary = await new RunRetention(
      ['c1'],
      async () => ({
        retention: fakeRetention({
          anonymizeWaitlistEntries: vi.fn(async () => 1),
        }),
        photoStorage: fakeStorage(),
        auditEvents: audit.repo,
      }),
      async () => ({
        retention: fakeRetention(),
        auditEvents: fakeAudit().repo,
      }),
      NOW,
    ).execute();

    expect(summary.clinics[0]).toMatchObject({
      waitlistEntries: 1,
      error: CLINIC_RETENTION_FAILED,
    });
    expect(audit.repo.save).toHaveBeenCalledTimes(2);
  });
});
