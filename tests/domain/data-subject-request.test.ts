import { describe, expect, it } from 'vitest';
import {
  DataSubjectRequest,
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
    });

    expect(restored.id).toBe(original.id);
    expect(restored.createdAt).toBe(original.createdAt);
  });
});
