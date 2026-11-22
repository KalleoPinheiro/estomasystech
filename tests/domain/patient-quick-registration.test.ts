import { describe, expect, it } from 'vitest';
import {
  Patient,
  QUICK_REGISTRATION_BIRTH_DATE_REQUIRED,
} from '@/domain/patient/patient';
import { ValidationError } from '@/domain/shared/errors';

/** #972: cadastro rápido de paciente na nova consulta. */
describe('Feature: cadastro rápido de paciente (#972)', () => {
  const birthDate = new Date('1960-04-12T00:00:00.000Z');

  it('Dado nome, celular e nascimento, Quando cadastrar rápido, Então nasce ativo e com cadastro incompleto', () => {
    const patient = Patient.createQuick({
      fullName: '  Ana Rápida  ',
      phone: '(11) 98888-7777',
      birthDate,
    });

    expect(patient.fullName).toBe('Ana Rápida');
    expect(patient.phone).toBe('+5511988887777');
    expect(patient.birthDate).toEqual(birthDate);
    expect(patient.isActive).toBe(true);
    expect(patient.registrationIncomplete).toBe(true);
    expect(patient.email).toBeNull();
    expect(patient.cpf).toBeNull();
  });

  it('Dado sem nascimento, Quando cadastrar rápido, Então recusa com mensagem clara', () => {
    expect(() =>
      Patient.createQuick({
        fullName: 'Ana',
        phone: '11988887777',
        birthDate: null,
      }),
    ).toThrow(new ValidationError(QUICK_REGISTRATION_BIRTH_DATE_REQUIRED));
  });

  it('Dado celular inválido, Quando cadastrar rápido, Então passa pela mesma validação do cadastro normal', () => {
    expect(() =>
      Patient.createQuick({ fullName: 'Ana', phone: '123', birthDate }),
    ).toThrow(ValidationError);
  });

  it('Dado cadastro normal, Então não fica marcado como incompleto', () => {
    const patient = Patient.create({ fullName: 'Bia', phone: '11977776666' });
    expect(patient.registrationIncomplete).toBe(false);
  });

  it('Dado cadastro rápido, Quando completar o cadastro, Então a marca some e o resto fica igual', () => {
    const quick = Patient.createQuick({
      fullName: 'Ana',
      phone: '11988887777',
      birthDate,
    });

    const completed = quick.completeRegistration();

    expect(completed.registrationIncomplete).toBe(false);
    expect(completed.id).toBe(quick.id);
    expect(quick.registrationIncomplete).toBe(true);
  });

  it('Dado cadastro rápido, Quando editar outro campo sem completar, Então a marca continua', () => {
    const quick = Patient.createQuick({
      fullName: 'Ana',
      phone: '11988887777',
      birthDate,
    });

    expect(quick.update({ notes: 'retorno' }).registrationIncomplete).toBe(
      true,
    );
  });
});
