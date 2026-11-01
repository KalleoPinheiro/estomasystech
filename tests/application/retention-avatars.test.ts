import { describe, expect, it, vi } from 'vitest';
import { NullCalendarGateway } from '@/application/ports/calendar-gateway';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import { RunRetention } from '@/application/retention/run-retention';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { RetentionRepository } from '@/domain/retention/retention-repository';

const NOW = new Date('2026-10-11T12:00:00Z');
const CUTOFF = new Date('2024-10-11T00:00:00Z');

const audit = (): AuditEventRepository => ({
  save: vi.fn(async () => undefined),
  findAll: vi.fn(async () => []),
  findPlatformTrail: vi.fn(async () => []),
  lockResource: vi.fn(async () => undefined),
});

const retentionWith = (
  overrides: Partial<RetentionRepository>,
): RetentionRepository => ({
  findPatientsDue: vi.fn(async () => []),
  anonymizePatient: vi.fn(async () => 0),
  findPendingPhotos: vi.fn(async () => []),
  markPhotoAnonymized: vi.fn(async () => undefined),
  anonymizeAuditEvents: vi.fn(async () => 0),
  findPendingCalendarEvents: vi.fn(async () => []),
  markCalendarEventRemoved: vi.fn(async () => undefined),
  expireWaitlistEntries: vi.fn(async () => 0),
  anonymizeWaitlistEntries: vi.fn(async () => 0),
  anonymizeInactiveAccounts: vi.fn(async () => 0),
  findInactiveAvatarKeys: vi.fn(async () => []),
  ...overrides,
});

const run = (retention: RetentionRepository, storage: PhotoStorage) =>
  new RunRetention(
    ['c1'],
    async () => ({
      retention,
      photoStorage: storage,
      calendar: new NullCalendarGateway(),
      auditEvents: audit(),
    }),
    async () => ({ retention: retentionWith({}), auditEvents: audit() }),
    NOW,
  ).execute();

describe('Feature: Retenção apaga a foto de rosto da equipe anonimizada (#427, LGPD)', () => {
  it('Dadas contas inativas com avatar vencidas, Quando o job roda, Então apaga os arquivos ANTES de anonimizar, com o corte das contas', async () => {
    const order: string[] = [];
    const retention = retentionWith({
      findInactiveAvatarKeys: vi.fn(async () => [
        'avatar-a-webp',
        'avatar-b-svg',
      ]),
      anonymizeInactiveAccounts: vi.fn(async () => {
        order.push('anonimiza');
        return 2;
      }),
    });
    const storage: PhotoStorage = {
      write: vi.fn(async () => undefined),
      read: vi.fn(async () => null),
      remove: vi.fn(async (key: string) => {
        order.push(`remove:${key}`);
      }),
    };

    const summary = await run(retention, storage);

    expect(retention.findInactiveAvatarKeys).toHaveBeenCalledWith(CUTOFF);
    expect(order).toEqual([
      'remove:avatar-a-webp',
      'remove:avatar-b-svg',
      'anonimiza',
    ]);
    expect(summary.accounts).toBe(2);
  });

  it('Dada falha ao apagar um arquivo, Quando o job roda, Então registra a chave no log e a anonimização segue', async () => {
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const retention = retentionWith({
      findInactiveAvatarKeys: vi.fn(async () => [
        'avatar-a-webp',
        'avatar-b-webp',
      ]),
      anonymizeInactiveAccounts: vi.fn(async () => 2),
    });
    const removed: string[] = [];
    const storage: PhotoStorage = {
      write: vi.fn(async () => undefined),
      read: vi.fn(async () => null),
      remove: vi.fn(async (key: string) => {
        if (key === 'avatar-a-webp') throw new Error('disco indisponível');
        removed.push(key);
      }),
    };

    const summary = await run(retention, storage);

    expect(removed).toEqual(['avatar-b-webp']);
    expect(retention.anonymizeInactiveAccounts).toHaveBeenCalled();
    expect(summary.accounts).toBe(2);
    expect(summary.clinics[0]?.error).toBeUndefined();
    expect(JSON.stringify(errors.mock.calls)).toContain(
      'falha ao apagar o avatar avatar-a-webp',
    );
    errors.mockRestore();
  });

  it('Dado nenhum avatar vencido, Quando o job roda, Então não mexe no armazenamento', async () => {
    const storage: PhotoStorage = {
      write: vi.fn(async () => undefined),
      read: vi.fn(async () => null),
      remove: vi.fn(async () => undefined),
    };

    await run(retentionWith({}), storage);

    expect(storage.remove).not.toHaveBeenCalled();
  });
});
