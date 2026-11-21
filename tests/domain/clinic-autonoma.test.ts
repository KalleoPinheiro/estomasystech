import { describe, expect, it } from 'vitest';
import {
  Clinic,
  CNPJ_ON_INDIVIDUAL_MESSAGE,
  CPF_ON_COMPANY_MESSAGE,
  isClinicInfoComplete,
  isClinicKind,
  MISSING_CNPJ_MESSAGE,
  MISSING_CPF_MESSAGE,
  missingClinicInfoFields,
  providerDocument,
  providerDocumentLabel,
} from '@/domain/clinic/clinic';
import { INVALID_CPF_MESSAGE } from '@/domain/shared/cpf';
import { ValidationError } from '@/domain/shared/errors';

const individual = (extra: Record<string, unknown> = {}) =>
  Clinic.create({
    kind: 'individual',
    name: ' Jeiciele Silva ',
    cpf: '529.982.247-25',
    contactPhone: '11 98888-7777',
    contactEmail: 'Contato@Exemplo.com',
    professionalRegistry: 'COREN-SP 123456',
    createdBy: 'super-admin',
    ...extra,
  });

describe('Feature: Cliente profissional autônoma com CPF (#977)', () => {
  it('Dada autônoma com CPF mascarado, Quando criar, Então grava o tipo, o CPF em 11 dígitos e nenhum CNPJ', () => {
    const clinic = individual();

    expect(clinic.kind).toBe('individual');
    expect(clinic.isIndividual).toBe(true);
    expect(clinic.cpf).toBe('52998224725');
    expect(clinic.cnpj).toBeNull();
    expect(clinic.providerDocument).toEqual({
      label: 'CPF',
      value: '529.982.247-25',
    });
  });

  it('Dada autônoma, Quando criar, Então a responsável técnica é ela mesma, sem preencher duas vezes', () => {
    const clinic = individual({ professionalName: 'Outra Pessoa' });

    expect(clinic.professionalName).toBe('Jeiciele Silva');
    expect(clinic.isCompleteForDocumentEmission()).toBe(true);
    expect(clinic.isRegistrationComplete()).toBe(true);
  });

  it('Dada autônoma sem CPF, Quando criar, Então recusa pedindo o CPF', () => {
    expect(() => individual({ cpf: '  ' })).toThrow(MISSING_CPF_MESSAGE);
  });

  it('Dada autônoma com CPF de dígito verificador errado, Quando criar, Então recusa', () => {
    expect(() => individual({ cpf: '529.982.247-24' })).toThrow(
      INVALID_CPF_MESSAGE,
    );
  });

  it('Dada autônoma com CNPJ, Quando criar, Então recusa: a autônoma usa só o CPF', () => {
    expect(() => individual({ cnpj: '12.345.678/0001-95' })).toThrow(
      CNPJ_ON_INDIVIDUAL_MESSAGE,
    );
  });

  it('Dada clínica com CPF, Quando criar, Então recusa: a clínica usa CNPJ', () => {
    expect(() =>
      Clinic.create({
        name: 'Clínica Aurora',
        cnpj: '12.345.678/0001-95',
        cpf: '52998224725',
        contactPhone: '11 3333-4444',
        contactEmail: 'contato@aurora.test',
        createdBy: 'super-admin',
      }),
    ).toThrow(CPF_ON_COMPANY_MESSAGE);
  });

  it('Dada clínica sem CNPJ e sem tipo, Quando criar, Então vale clínica e pede o CNPJ', () => {
    expect(() =>
      Clinic.create({
        name: 'Clínica Aurora',
        contactPhone: '11 3333-4444',
        contactEmail: 'contato@aurora.test',
        createdBy: 'super-admin',
      }),
    ).toThrow(MISSING_CNPJ_MESSAGE);
  });

  it('Dado tipo fora da lista, Quando criar, Então recusa', () => {
    expect(() => individual({ kind: 'mei' })).toThrow(
      'Tipo de cliente inválido',
    );
    expect(isClinicKind('company')).toBe(true);
    expect(isClinicKind('mei')).toBe(false);
  });

  it('Dada autônoma, Quando editar o nome, Então o responsável técnico acompanha o nome', () => {
    const updated = individual().updateInfo({
      name: 'Jeiciele S. Silva',
      professionalName: 'Ignorado',
    });

    expect(updated.name).toBe('Jeiciele S. Silva');
    expect(updated.professionalName).toBe('Jeiciele S. Silva');
    expect(updated.kind).toBe('individual');
  });

  it('Dada autônoma, Quando editar com CNPJ, Então recusa; com CPF novo, troca', () => {
    const clinic = individual();

    expect(() => clinic.updateInfo({ cnpj: '12.345.678/0001-95' })).toThrow(
      ValidationError,
    );
    expect(clinic.updateInfo({ cpf: '111.444.777-35' }).cpf).toBe(
      '11144477735',
    );
  });

  it('Dada clínica, Quando editar com CPF, Então recusa', () => {
    const clinic = Clinic.restore({
      id: 'c-1',
      name: 'Clínica Aurora',
      createdBy: 'x',
      createdAt: new Date(),
      cnpj: '12.345.678/0001-95',
    });

    expect(() => clinic.updateInfo({ cpf: '52998224725' })).toThrow(
      CPF_ON_COMPANY_MESSAGE,
    );
    expect(clinic.updateInfo({ cpf: '' }).cpf).toBeNull();
  });

  it('Dada linha gravada com tipo desconhecido ou sem tipo, Quando restaurar, Então vale clínica', () => {
    const base = { id: 'c', name: 'A', createdBy: 'x', createdAt: new Date() };

    expect(Clinic.restore(base).kind).toBe('company');
    expect(
      Clinic.restore({ ...base, kind: 'outro' as never }).isIndividual,
    ).toBe(false);
  });

  it('Dada autônoma sem CPF gravado, Quando conferir documentos e cadastro, Então falta o CPF', () => {
    const info = {
      kind: 'individual' as const,
      cpf: null,
      cnpj: '12.345.678/0001-95',
      professionalName: 'Jeiciele',
      professionalRegistry: 'COREN-SP 1',
    };

    expect(isClinicInfoComplete(info)).toBe(false);
    expect(missingClinicInfoFields(info)).toEqual(['CPF']);
    expect(
      individual().updateInfo({ cpf: null }).isRegistrationComplete(),
    ).toBe(false);
  });

  it('Dados os tipos, Quando montar o documento de quem emite, Então CNPJ da clínica e CPF formatado da autônoma', () => {
    expect(providerDocumentLabel('individual')).toBe('CPF');
    expect(providerDocumentLabel(null)).toBe('CNPJ');
    expect(
      providerDocument({ kind: 'individual', cpf: '52998224725', cnpj: null }),
    ).toEqual({ label: 'CPF', value: '529.982.247-25' });
    expect(
      providerDocument({ cnpj: ' 12.345.678/0001-95 ', cpf: '52998224725' }),
    ).toEqual({ label: 'CNPJ', value: '12.345.678/0001-95' });
    expect(
      providerDocument({ kind: 'individual', cpf: 'legado', cnpj: null }),
    ).toEqual({ label: 'CPF', value: 'legado' });
    expect(providerDocument(null)).toBeNull();
    expect(missingClinicInfoFields(null)).toEqual([
      'CNPJ',
      'responsável técnico',
      'registro profissional',
    ]);
  });
});
