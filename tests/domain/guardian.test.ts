import { describe, expect, it } from 'vitest';
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  GUARDIAN_RELATIONSHIPS,
  Guardian,
  type GuardianRelationship,
} from '@/domain/guardian/guardian';
import { ValidationError } from '@/domain/shared/errors';

const valid = {
  fullName: 'Ana Souza',
  relationship: 'filho' as const,
  phone: '(11) 99999-0000',
};

describe('Feature: Responsável ou cuidador do paciente (#329)', () => {
  it('Dado dados válidos, Quando criar, Então guarda telefone em E.164 e e-mail opcional vazio vira null', () => {
    const guardian = Guardian.create({ ...valid, email: '  ' });

    expect(guardian.phone).toBe('+5511999990000');
    expect(guardian.email).toBeNull();
    expect(guardian.relationshipLabel).toBe('Filho(a)');
    expect(guardian.id).toBeTruthy();
  });

  it('Dado e-mail preenchido, Quando criar, Então guarda em minúsculas', () => {
    expect(Guardian.create({ ...valid, email: 'Ana@Exemplo.COM' }).email).toBe(
      'ana@exemplo.com',
    );
  });

  it.each([
    [{ fullName: 'Al' }, /Nome/],
    [{ phone: '99999-0000' }, /DDD/],
    [{ email: 'sem-arroba' }, /Email inválido/],
    [
      { relationship: 'vizinho' as unknown as GuardianRelationship },
      /Parentesco/,
    ],
  ])('Dado %j, Quando criar, Então ValidationError', (changes, message) => {
    expect(() => Guardian.create({ ...valid, ...changes })).toThrow(
      ValidationError,
    );
    expect(() => Guardian.create({ ...valid, ...changes })).toThrow(message);
  });

  it('Dado responsável, Quando update, Então undefined mantém, null remove o e-mail e a validação vale', () => {
    const guardian = Guardian.create({ ...valid, email: 'ana@exemplo.com' });

    expect(guardian.update({ fullName: 'Ana Maria Souza' }).email).toBe(
      'ana@exemplo.com',
    );
    expect(guardian.update({ email: null }).email).toBeNull();
    expect(
      guardian.update({ relationship: 'cuidador' }).relationshipLabel,
    ).toBe('Cuidador(a) contratado(a)');
    expect(() => guardian.update({ phone: '123' })).toThrow(ValidationError);
    expect(guardian.update({}).id).toBe(guardian.id);
  });

  it('Todo parentesco tem rótulo', () => {
    for (const key of GUARDIAN_RELATIONSHIPS) {
      expect(GUARDIAN_RELATIONSHIP_LABELS[key]).toBeTruthy();
    }
  });

  it('Dado estado salvo, Quando restore, Então preserva id e criação', () => {
    const created = Guardian.create(valid);
    const restored = Guardian.restore({
      id: created.id,
      fullName: created.fullName,
      relationship: created.relationship,
      phone: created.phone,
      email: created.email,
      createdAt: created.createdAt,
    });

    expect(restored.id).toBe(created.id);
    expect(restored.createdAt).toEqual(created.createdAt);
  });
});
