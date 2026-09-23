import { describe, expect, it } from 'vitest';
import {
  cancellationPolicyOf,
  DEFAULT_CANCELLATION_POLICY,
  DEFAULT_SCHEDULE_CONFIG,
  isLateChange,
  validateCancellationPolicy,
  validateScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import {
  InvalidStatusTransitionError,
  ValidationError,
} from '@/domain/shared/errors';

describe('Feature: Política de cancelamento', () => {
  const start = new Date('2026-07-20T09:00:00Z');
  const policy = { noticeHours: 24, lateFeeCents: 5000 };

  it('Dado exatamente 24h antes, Então ainda não é tardio; um segundo depois, é', () => {
    expect(isLateChange(start, new Date('2026-07-19T09:00:00Z'), policy)).toBe(
      false,
    );
    expect(isLateChange(start, new Date('2026-07-19T09:00:01Z'), policy)).toBe(
      true,
    );
  });

  it('Dado antecedência 0, Então só é tardio depois do início', () => {
    const none = { noticeHours: 0, lateFeeCents: 0 };
    expect(isLateChange(start, new Date('2026-07-20T08:59:00Z'), none)).toBe(
      false,
    );
    expect(isLateChange(start, new Date('2026-07-20T09:00:01Z'), none)).toBe(
      true,
    );
  });

  it.each([
    [{ noticeHours: -1, lateFeeCents: 0 }],
    [{ noticeHours: 169, lateFeeCents: 0 }],
    [{ noticeHours: 1.5, lateFeeCents: 0 }],
    [{ noticeHours: 24, lateFeeCents: -1 }],
    [{ noticeHours: 24, lateFeeCents: 1_000_001 }],
  ])('Dado política inválida %o, Então ValidationError', (invalid) => {
    expect(() => validateCancellationPolicy(invalid)).toThrow(ValidationError);
  });

  it('Dado grade sem política, Então valida para o padrão (24h, sem taxa)', () => {
    const { cancellationPolicy: _, ...legacy } = DEFAULT_SCHEDULE_CONFIG;
    expect(validateScheduleConfig(legacy).cancellationPolicy).toEqual(
      DEFAULT_CANCELLATION_POLICY,
    );
    expect(cancellationPolicyOf(null)).toEqual(DEFAULT_CANCELLATION_POLICY);
    expect(
      cancellationPolicyOf({
        ...DEFAULT_SCHEDULE_CONFIG,
        cancellationPolicy: policy,
      }),
    ).toEqual(policy);
  });
});

describe('Feature: Entrada na lista de espera', () => {
  const now = new Date('2026-07-01T12:00:00Z');
  const base = {
    patientId: 'pat-1',
    fromDate: '2026-07-10',
    toDate: '2026-07-20',
    source: 'staff' as const,
  };

  it('Dado dados válidos, Quando criar, Então fica aguardando, sem profissional/procedimento e com observação aparada', () => {
    const entry = WaitlistEntry.create(
      { ...base, notes: '  só de manhã ' },
      now,
    );
    expect(entry.status).toBe('waiting');
    expect(entry.procedureId).toBeNull();
    expect(entry.professionalId).toBeNull();
    expect(entry.notes).toBe('só de manhã');
    expect(entry.createdAt).toBe(now);
    expect(entry.resolvedAt).toBeNull();
  });

  it.each([
    ['paciente vazio', { ...base, patientId: ' ' }],
    ['data inexistente', { ...base, fromDate: '2026-02-30' }],
    ['fim antes do início', { ...base, toDate: '2026-07-09' }],
    ['mais de 180 dias', { ...base, toDate: '2027-01-06' }],
    ['observação longa', { ...base, notes: 'x'.repeat(501) }],
  ])('Dado %s, Quando criar, Então ValidationError', (_, props) => {
    expect(() => WaitlistEntry.create(props, now)).toThrow(ValidationError);
  });

  it('Dado janela de exatamente 180 dias, Quando criar, Então aceita', () => {
    expect(() =>
      WaitlistEntry.create({ ...base, toDate: '2027-01-05' }, now),
    ).not.toThrow();
  });

  it('Dado entrada sem profissional, Então aceita vaga de qualquer um dentro da janela (pontas incluídas)', () => {
    const entry = WaitlistEntry.create(base, now);
    expect(entry.accepts('2026-07-10', 'prof-1')).toBe(true);
    expect(entry.accepts('2026-07-20', null)).toBe(true);
    expect(entry.accepts('2026-07-09', null)).toBe(false);
    expect(entry.accepts('2026-07-21', null)).toBe(false);
  });

  it('Dado entrada com a Dra. Ana, Então aceita vaga dela ou sem profissional, não de outro', () => {
    const entry = WaitlistEntry.create({ ...base, professionalId: 'ana' }, now);
    expect(entry.accepts('2026-07-15', 'ana')).toBe(true);
    expect(entry.accepts('2026-07-15', null)).toBe(true);
    expect(entry.accepts('2026-07-15', 'bia')).toBe(false);
  });

  it('Dado entrada resolvida, Então não aceita mais vaga e não pode ser resolvida de novo', () => {
    const at = new Date('2026-07-05T10:00:00Z');
    const scheduled = WaitlistEntry.create(base, now).markScheduled(at);
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.resolvedAt).toBe(at);
    expect(scheduled.accepts('2026-07-15', null)).toBe(false);
    expect(() => scheduled.remove()).toThrow(InvalidStatusTransitionError);

    const removed = WaitlistEntry.create(base, now).remove(at);
    expect(removed.status).toBe('removed');
    expect(() => removed.markScheduled()).toThrow(InvalidStatusTransitionError);
  });
});
