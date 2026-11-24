import { describe, expect, it } from 'vitest';
import {
  ALREADY_COMPANY_MESSAGE,
  Clinic,
  MISSING_CNPJ_MESSAGE,
  providerDocument,
} from '@/domain/clinic/clinic';

const individual = () =>
  Clinic.create({
    kind: 'individual',
    name: 'Jeiciele Silva',
    cpf: '529.982.247-25',
    contactPhone: '11 98888-7777',
    contactEmail: 'contato@exemplo.com',
    professionalRegistry: 'COREN-SP 123456',
    createdBy: 'super-admin',
  });

describe('Feature: autônoma que abre CNPJ (#986)', () => {
  it('troca para clínica com o CNPJ no timbre e sem o CPF, mantendo o resto', () => {
    const before = individual();
    const after = before.convertToCompany({ cnpj: '12.345.678/0001-95' });

    expect(after.kind).toBe('company');
    expect(after.cnpj).toBe('12.345.678/0001-95');
    expect(after.cpf).toBeNull();
    expect(providerDocument(after)).toEqual({
      label: 'CNPJ',
      value: '12.345.678/0001-95',
    });
    expect(after.id).toBe(before.id);
    expect(after.name).toBe('Jeiciele Silva');
    expect(after.professionalName).toBe('Jeiciele Silva');
    expect(after.professionalRegistry).toBe('COREN-SP 123456');
    expect(after.contactPhone).toBe(before.contactPhone);
    expect(after.cnpjReviewSince).toBeNull();
    expect(before.kind).toBe('individual');
  });

  it('razão social troca o nome; vazio mantém o atual', () => {
    const clinic = individual();
    expect(
      clinic.convertToCompany({
        cnpj: '12345678000195',
        name: ' Estoma Saúde Ltda ',
      }).name,
    ).toBe('Estoma Saúde Ltda');
    expect(
      clinic.convertToCompany({ cnpj: '12345678000195', name: '  ' }).name,
    ).toBe('Jeiciele Silva');
  });

  it('depois da troca, editar o cadastro segue a regra da clínica', () => {
    const company = individual().convertToCompany({ cnpj: '12345678000195' });
    const edited = company.updateInfo({
      professionalName: 'Outra Responsável',
    });
    expect(edited.professionalName).toBe('Outra Responsável');
  });

  it('exige CNPJ válido', () => {
    expect(() => individual().convertToCompany({ cnpj: '  ' })).toThrow(
      MISSING_CNPJ_MESSAGE,
    );
    expect(() =>
      individual().convertToCompany({ cnpj: '12.345.678/0001-00' }),
    ).toThrow();
  });

  it('clínica já com CNPJ não troca de novo', () => {
    const company = individual().convertToCompany({ cnpj: '12345678000195' });
    expect(() => company.convertToCompany({ cnpj: '12345678000195' })).toThrow(
      ALREADY_COMPANY_MESSAGE,
    );
  });
});
