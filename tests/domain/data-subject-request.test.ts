import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DataSubjectRequest,
  daysUntilDeadline,
  deadlineDateKey,
  MAX_DETAILS_LENGTH,
  MAX_RESOLUTION_LENGTH,
} from '@/domain/patient/data-subject-request';
import {
  InvalidStatusTransitionError,
  ValidationError,
} from '@/domain/shared/errors';

describe('DataSubjectRequest (#293)', () => {
  it('nasce pendente, com a descrição aparada', () => {
    const request = DataSubjectRequest.create({
      patientId: 'p1',
      kind: 'correction',
      details: '  telefone novo  ',
    });

    expect(request.status).toBe('pending');
    expect(request.details).toBe('telefone novo');
    expect(request.resolution).toBeNull();
    expect(request.resolvedAt).toBeNull();
  });

  it('eliminação aceita descrição vazia', () => {
    const request = DataSubjectRequest.create({
      patientId: 'p1',
      kind: 'erasure',
      details: '   ',
    });

    expect(request.details).toBeNull();
  });

  it.each([
    [{ patientId: ' ', kind: 'erasure' as const }],
    [{ patientId: 'p1', kind: 'correction' as const }],
    [{ patientId: 'p1', kind: 'other' as never }],
    [
      {
        patientId: 'p1',
        kind: 'erasure' as const,
        details: 'x'.repeat(MAX_DETAILS_LENGTH + 1),
      },
    ],
  ])('recusa pedido inválido %#', (props) => {
    expect(() => DataSubjectRequest.create(props)).toThrow(ValidationError);
  });

  it('aceitar e recusar exigem justificativa e só valem uma vez', () => {
    const at = new Date('2026-10-11T12:00:00Z');
    const request = DataSubjectRequest.create({
      patientId: 'p1',
      kind: 'erasure',
    });

    expect(() => request.accept('  ')).toThrow(ValidationError);
    expect(() => request.reject('x'.repeat(MAX_RESOLUTION_LENGTH + 1))).toThrow(
      ValidationError,
    );

    const accepted = request.accept(' guarda legal ', at);
    expect(accepted.status).toBe('accepted');
    expect(accepted.resolution).toBe('guarda legal');
    expect(accepted.resolvedAt).toEqual(at);
    expect(request.status).toBe('pending');
    expect(() => accepted.reject('outra')).toThrow(
      InvalidStatusTransitionError,
    );
    expect(request.reject('não procede').status).toBe('rejected');
  });

  it('restore preserva o estado', () => {
    const original = DataSubjectRequest.create({
      patientId: 'p1',
      kind: 'correction',
      details: 'nome',
    });
    const restored = DataSubjectRequest.restore({
      id: original.id,
      patientId: original.patientId,
      kind: original.kind,
      details: original.details,
      status: original.status,
      resolution: original.resolution,
      createdAt: original.createdAt,
      resolvedAt: original.resolvedAt,
      deadlineAlertedAt: original.deadlineAlertedAt,
    });

    expect(restored.id).toBe(original.id);
    expect(restored.createdAt).toBe(original.createdAt);
  });

  it('registra o aviso de prazo só em pedido pendente', () => {
    const request = DataSubjectRequest.create({
      patientId: 'p1',
      kind: 'erasure',
    });
    const at = new Date('2026-10-20T12:00:00Z');

    const alerted = request.markDeadlineAlerted(at);

    expect(alerted.deadlineAlertedAt).toEqual(at);
    expect(request.deadlineAlertedAt).toBeNull();
    expect(() => request.accept('ok').markDeadlineAlerted()).toThrow(
      InvalidStatusTransitionError,
    );
  });
});

describe('Prazo de 15 dias (#312)', () => {
  afterEach(() => vi.unstubAllEnvs());

  const tz = 'America/Sao_Paulo';

  it('o recebimento é o dia 0 e o limite é o 15º dia corrido', () => {
    const createdAt = new Date('2026-10-01T15:00:00Z'); // 12h em São Paulo

    expect(deadlineDateKey(createdAt, tz)).toBe('2026-10-16');
    expect(daysUntilDeadline(createdAt, createdAt, tz)).toBe(15);
    expect(
      daysUntilDeadline(createdAt, new Date('2026-10-13T15:00:00Z'), tz),
    ).toBe(3);
    expect(
      daysUntilDeadline(createdAt, new Date('2026-10-16T15:00:00Z'), tz),
    ).toBe(0);
    expect(
      daysUntilDeadline(createdAt, new Date('2026-10-17T15:00:00Z'), tz),
    ).toBe(-1);
  });

  it('a virada de dia é a do fuso da clínica, não a do UTC', () => {
    // 22h30 do dia 1º em São Paulo já é dia 2 em UTC.
    const createdAt = new Date('2026-10-02T01:30:00Z');

    expect(deadlineDateKey(createdAt, tz)).toBe('2026-10-16');
    // 23h30 de 15/10 em São Paulo (02h30 de 16/10 em UTC): ainda 1 dia.
    expect(
      daysUntilDeadline(createdAt, new Date('2026-10-16T02:30:00Z'), tz),
    ).toBe(1);
    // 00h10 de 16/10 em São Paulo: vence hoje.
    expect(
      daysUntilDeadline(createdAt, new Date('2026-10-16T03:10:00Z'), tz),
    ).toBe(0);
    // 00h10 de 17/10 em São Paulo (03h10 UTC): venceu ontem.
    expect(
      daysUntilDeadline(createdAt, new Date('2026-10-17T03:10:00Z'), tz),
    ).toBe(-1);
  });

  it('usa APP_TIMEZONE quando o fuso não é informado', () => {
    vi.stubEnv('APP_TIMEZONE', tz);
    const createdAt = new Date('2026-10-02T01:30:00Z');

    expect(deadlineDateKey(createdAt)).toBe('2026-10-16');
    expect(daysUntilDeadline(createdAt, createdAt)).toBe(15);
  });
});
