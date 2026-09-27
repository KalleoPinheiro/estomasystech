import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AuditEvent } from '@/domain/audit/audit-event';
import { ValidationError } from '@/domain/shared/errors';

const validProps = {
  clinicId: 'clinic-1',
  actorRole: 'admin',
  actorId: 'staff',
  action: 'read' as const,
  resourceType: 'anamnesis',
  resourceId: 'anamnesis-1',
};

describe('Feature: Evento de auditoria de prontuário', () => {
  describe('Cenário: registrar evento válido', () => {
    it('Dado dados válidos, Quando criar, Então evento com id e occurredAt gerados', () => {
      const event = AuditEvent.create(validProps);

      expect(event.id).toBeTruthy();
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event.action).toBe('read');
      expect(event.resourceType).toBe('anamnesis');
    });

    it('Dado patientId e detail, Quando criar, Então evento guarda ambos', () => {
      const event = AuditEvent.create({
        ...validProps,
        patientId: 'patient-1',
        detail: 'Acesso via portal',
      });

      expect(event.patientId).toBe('patient-1');
      expect(event.detail).toBe('Acesso via portal');
    });

    it('Dado patientId e detail omitidos, Quando criar, Então ambos são nulos', () => {
      const event = AuditEvent.create(validProps);

      expect(event.patientId).toBeNull();
      expect(event.detail).toBeNull();
    });

    it('Dado clinicId nulo, Quando criar, Então é evento de plataforma (clinicId null, B6)', () => {
      const event = AuditEvent.create({ ...validProps, clinicId: null });

      expect(event.clinicId).toBeNull();
    });

    it('Dado cada ação suportada, Quando criar, Então action é preservada', () => {
      for (const action of AUDIT_ACTIONS) {
        const event = AuditEvent.create({ ...validProps, action });
        expect(event.action).toBe(action);
      }
    });
  });

  describe('Cenário: rejeitar dados inválidos', () => {
    it('Dado clinicId vazio, Quando criar, Então lança ValidationError (Empresa da auditoria é obrigatória)', () => {
      expect(() => AuditEvent.create({ ...validProps, clinicId: ' ' })).toThrow(
        new ValidationError('Empresa da auditoria é obrigatória'),
      );
    });

    it('Dado actorRole vazio, Quando criar, Então lança ValidationError', () => {
      expect(() =>
        AuditEvent.create({ ...validProps, actorRole: ' ' }),
      ).toThrow(ValidationError);
    });

    it('Dado actorId vazio, Quando criar, Então lança ValidationError', () => {
      expect(() => AuditEvent.create({ ...validProps, actorId: ' ' })).toThrow(
        ValidationError,
      );
    });

    it('Dado resourceType vazio, Quando criar, Então lança ValidationError', () => {
      expect(() =>
        AuditEvent.create({ ...validProps, resourceType: ' ' }),
      ).toThrow(ValidationError);
    });

    it('Dado resourceId vazio, Quando criar, Então lança ValidationError', () => {
      expect(() =>
        AuditEvent.create({ ...validProps, resourceId: ' ' }),
      ).toThrow(ValidationError);
    });
  });

  describe('Cenário: reconstituir evento da persistência', () => {
    it('Dado state completo, Quando restore, Então mantém id e occurredAt originais', () => {
      const occurredAt = new Date('2026-02-01T08:00:00Z');
      const event = AuditEvent.restore({
        id: 'event-1',
        clinicId: 'clinic-1',
        actorRole: 'partner',
        actorId: 'partner-1',
        action: 'update',
        resourceType: 'evolution',
        resourceId: 'evolution-1',
        patientId: 'patient-1',
        detail: null,
        occurredAt,
      });

      expect(event.id).toBe('event-1');
      expect(event.occurredAt).toEqual(occurredAt);
      expect(event.action).toBe('update');
    });
  });
});
