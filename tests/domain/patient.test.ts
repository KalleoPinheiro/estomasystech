import { describe, expect, it } from 'vitest';
import {
  ANONYMIZED_PATIENT_REACTIVATION,
  Patient,
} from '@/domain/patient/patient';
import { ConflictError, ValidationError } from '@/domain/shared/errors';

const validProps = {
  fullName: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '11999990000',
};

describe('Feature: Cadastro de paciente', () => {
  describe('Cenário: criar paciente válido', () => {
    it('Dado dados válidos, Quando criar, Então paciente ativo com id gerado', () => {
      const patient = Patient.create(validProps);

      expect(patient.id).toBeTruthy();
      expect(patient.fullName).toBe('Maria da Silva');
      expect(patient.isActive).toBe(true);
      expect(patient.createdAt).toBeInstanceOf(Date);
    });

    it('Dado nome com espaços nas bordas, Quando criar, Então nome é normalizado', () => {
      const patient = Patient.create({
        ...validProps,
        fullName: '  João Souza  ',
      });

      expect(patient.fullName).toBe('João Souza');
    });
  });

  describe('Cenário: rejeitar dados inválidos', () => {
    it('Dado nome muito curto, Quando criar, Então lança ValidationError', () => {
      expect(() => Patient.create({ ...validProps, fullName: 'Jo' })).toThrow(
        ValidationError,
      );
    });

    it('Dado email inválido, Quando criar, Então lança ValidationError', () => {
      expect(() =>
        Patient.create({ ...validProps, email: 'not-an-email' }),
      ).toThrow(ValidationError);
    });

    it('Dado telefone vazio, Quando criar, Então lança ValidationError', () => {
      expect(() => Patient.create({ ...validProps, phone: '' })).toThrow(
        ValidationError,
      );
    });
  });

  describe('Cenário: atualizar dados do paciente', () => {
    it('Dado paciente existente, Quando atualizar nome, Então retorna novo Patient com nome novo', () => {
      const patient = Patient.create(validProps);

      const updated = patient.update({ fullName: 'Maria Oliveira' });

      expect(updated.fullName).toBe('Maria Oliveira');
      expect(updated.id).toBe(patient.id);
      expect(patient.fullName).toBe('Maria da Silva');
    });

    it('Dado atualização inválida, Quando atualizar, Então lança ValidationError', () => {
      const patient = Patient.create(validProps);

      expect(() => patient.update({ email: 'broken' })).toThrow(
        ValidationError,
      );
    });
  });

  describe('Cenário: desativar e reativar paciente', () => {
    it('Dado paciente ativo, Quando desativar, Então isActive é false', () => {
      const patient = Patient.create(validProps);

      const deactivated = patient.deactivate();

      expect(deactivated.isActive).toBe(false);
      expect(patient.isActive).toBe(true);
    });

    it('Dado paciente inativo, Quando reativar, Então isActive é true', () => {
      const patient = Patient.create(validProps).deactivate();

      expect(patient.reactivate().isActive).toBe(true);
    });
  });

  describe('Cenário: reconstituir paciente da persistência', () => {
    it('Dado props completas com id, Quando restore, Então mantém id e datas', () => {
      const createdAt = new Date('2026-01-01T12:00:00Z');
      const patient = Patient.restore({
        id: 'abc-123',
        fullName: 'Maria da Silva',
        email: 'maria@example.com',
        phone: '11999990000',
        birthDate: null,
        notes: null,
        active: false,
        createdAt,
      });

      expect(patient.id).toBe('abc-123');
      expect(patient.isActive).toBe(false);
      expect(patient.createdAt).toEqual(createdAt);
    });
  });

  describe('Cenário: paciente anonimizado (ADR-017)', () => {
    const restored = (anonymizedAt: Date | null) =>
      Patient.restore({
        id: 'pat-anon',
        fullName: 'Paciente anonimizado',
        email: 'anonimizado+pat-anon@anonimizado.invalid',
        phone: '',
        birthDate: null,
        notes: null,
        active: false,
        createdAt: new Date('2006-01-01T00:00:00Z'),
        anonymizedAt,
      });

    it('Dado paciente anonimizado, Quando reativar, Então recusa com erro claro', () => {
      const patient = restored(new Date('2026-10-12T00:00:00Z'));

      expect(patient.isAnonymized).toBe(true);
      expect(() => patient.reactivate()).toThrow(
        ANONYMIZED_PATIENT_REACTIVATION,
      );
      expect(() => patient.reactivate()).toThrow(ConflictError);
    });

    it('Dado paciente desativado comum, Quando reativar, Então reativa', () => {
      const patient = restored(null);

      expect(patient.isAnonymized).toBe(false);
      expect(patient.reactivate().isActive).toBe(true);
    });
  });
});
