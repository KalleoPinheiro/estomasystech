import { describe, expect, it } from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import { ValidationError } from '@/domain/shared/errors';

const clinic = () =>
  Clinic.restore({
    id: 'c-1',
    name: 'Clínica',
    createdBy: 'test',
    createdAt: new Date('2026-10-18T00:00:00Z'),
  });

describe('Feature: Encarregado pelos dados da clínica (#216, ADR-030)', () => {
  it('Dada clínica sem encarregado, Então os campos são nulos', () => {
    expect(clinic().dpoName).toBeNull();
    expect(clinic().dpoContact).toBeNull();
  });

  it('Dado nome e canal, Quando atualizar, Então grava aparados e não muda a original', () => {
    const original = clinic();
    const updated = original.updatePrivacyContact({
      dpoName: ' Beatriz Lima ',
      dpoContact: ' dpo@x.test ',
    });

    expect(updated.dpoName).toBe('Beatriz Lima');
    expect(updated.dpoContact).toBe('dpo@x.test');
    expect(original.dpoName).toBeNull();
  });

  it('Dado só o canal, Então o nome fica vazio', () => {
    const updated = clinic().updatePrivacyContact({ dpoContact: 'dpo@x.test' });

    expect(updated.dpoName).toBeNull();
    expect(updated.dpoContact).toBe('dpo@x.test');
  });

  it('Dado campos vazios, Quando atualizar, Então apaga e a clínica volta a valer como canal', () => {
    const updated = clinic()
      .updatePrivacyContact({ dpoName: 'B', dpoContact: 'b@x.test' })
      .updatePrivacyContact({ dpoName: ' ', dpoContact: '' });

    expect(updated.dpoName).toBeNull();
    expect(updated.dpoContact).toBeNull();
  });

  it('Dado nome sem canal, Então lança ValidationError', () => {
    expect(() => clinic().updatePrivacyContact({ dpoName: 'Beatriz' })).toThrow(
      ValidationError,
    );
  });

  it.each([
    ['dpoName', { dpoName: 'x'.repeat(201), dpoContact: 'a@b.c' }],
    ['dpoContact', { dpoContact: 'x'.repeat(201) }],
  ])(
    'Dado %s acima do limite, Então lança ValidationError',
    (_label, fields) => {
      expect(() => clinic().updatePrivacyContact(fields)).toThrow(
        ValidationError,
      );
    },
  );

  it('Dada clínica restaurada com encarregado, Então preserva o valor', () => {
    const restored = Clinic.restore({
      id: 'c-2',
      name: 'Clínica',
      createdBy: 'test',
      createdAt: new Date(),
      dpoName: 'B',
      dpoContact: 'b@x.test',
    });

    expect(restored.dpoName).toBe('B');
    expect(restored.dpoContact).toBe('b@x.test');
  });
});
