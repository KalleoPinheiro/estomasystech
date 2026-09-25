import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dateKey,
  REMINDER_CHANNELS,
  REMINDER_KINDS,
  ReminderLog,
} from '@/domain/messaging/reminder-log';

describe('Feature: Registro de lembrete enviado', () => {
  describe('Cenário: criar registro', () => {
    it('Dado kind e referenceId, Quando criar sem sentAt, Então usa a data atual', () => {
      const before = new Date();
      const log = ReminderLog.create('confirmation', 'appt-1');
      const after = new Date();

      expect(log.id).toBeTruthy();
      expect(log.kind).toBe('confirmation');
      expect(log.referenceId).toBe('appt-1');
      expect(log.sentOn).toBe(dateKey(before));
      expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(log.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('Dado sentAt explícito, Quando criar, Então sentOn reflete o dia informado', () => {
      const sentAt = new Date('2026-05-10T23:59:00Z');
      const log = ReminderLog.create('recall', 'followup-1', sentAt);

      expect(log.sentOn).toBe('2026-05-10');
      expect(log.createdAt).toEqual(sentAt);
    });

    it('Dado cada tipo suportado, Quando criar, Então kind é preservado', () => {
      for (const kind of REMINDER_KINDS) {
        const log = ReminderLog.create(kind, 'ref-1');
        expect(log.kind).toBe(kind);
      }
    });
  });

  describe('Cenário: reconstituir registro da persistência', () => {
    it('Dado state completo, Quando restore, Então mantém todos os campos', () => {
      const createdAt = new Date('2026-06-01T10:00:00Z');
      const log = ReminderLog.restore({
        id: 'log-1',
        kind: 'confirmation',
        referenceId: 'appt-9',
        channel: 'whatsapp_link',
        attempt: 1,
        sentOn: '2026-06-01',
        createdAt,
      });

      expect(log.id).toBe('log-1');
      expect(log.referenceId).toBe('appt-9');
      expect(log.channel).toBe('whatsapp_link');
      expect(log.attempt).toBe(1);
      expect(log.sentOn).toBe('2026-06-01');
      expect(log.createdAt).toEqual(createdAt);
    });
  });
});

describe('Feature: Chave de idempotência diária (dateKey)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Dado uma data, Quando gerar chave em UTC, Então retorna YYYY-MM-DD', () => {
    expect(dateKey(new Date('2026-01-05T15:30:00Z'))).toBe('2026-01-05');
  });

  it('C17 dateKey usa a data local do fuso TZ', () => {
    vi.stubEnv('TZ', 'America/Sao_Paulo');

    // 23:30 de 16/07 em São Paulo = 02:30 UTC de 17/07.
    expect(dateKey(new Date('2026-07-17T02:30:00Z'))).toBe('2026-07-16');
  });
});

describe('Feature: Canal e tentativa do registro', () => {
  it('Dado criação sem opções, Quando criar, Então canal e-mail e tentativa 1', () => {
    const log = ReminderLog.create('recall', 'fu-1');

    expect(REMINDER_CHANNELS).toEqual(['email', 'whatsapp_link']);
    expect(log.channel).toBe('email');
    expect(log.attempt).toBe(1);
  });

  it('Dado canal e tentativa explícitos, Quando criar, Então preserva os dois', () => {
    const log = ReminderLog.create('recall', 'fu-1', new Date(), {
      channel: 'whatsapp_link',
      attempt: 2,
    });

    expect(log.channel).toBe('whatsapp_link');
    expect(log.attempt).toBe(2);
  });
});
