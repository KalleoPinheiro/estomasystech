import { describe, expect, it } from 'vitest';
import {
  CNPJ_UNDER_REVIEW_MESSAGE,
  MISSING_PATIENT_CPF_MESSAGE,
  MISSING_PROVIDER_DOCUMENT_MESSAGE,
  resolveReceiptParties,
} from '@/domain/billing/receipt';
import { ValidationError } from '@/domain/shared/errors';

const clinic = { name: 'Clínica EstomaSysTech', cnpj: '12.345.678/0001-95' };
const patient = { fullName: 'Maria Souza', cpf: '52998224725' };

describe('Feature: Recibo válido para o IRPF (#326, FIN-RN-15)', () => {
  it('Dado paciente com CPF e empresa com CNPJ, Quando resolver, Então o pagador é o paciente', () => {
    expect(resolveReceiptParties({ clinic, patient })).toEqual({
      provider: {
        name: 'Clínica EstomaSysTech',
        document: '12.345.678/0001-95',
      },
      payer: { name: 'Maria Souza', document: '529.982.247-25' },
      payerIsPatient: true,
    });
  });

  it('Dado pagador informado no recebimento, Quando resolver, Então o recibo sai no nome dele, mesmo sem CPF do paciente', () => {
    const parties = resolveReceiptParties({
      clinic,
      patient: { fullName: 'Maria Souza', cpf: null },
      payer: { name: 'João Souza', cpf: '11144477735' },
    });
    expect(parties.payer).toEqual({
      name: 'João Souza',
      document: '111.444.777-35',
    });
    expect(parties.payerIsPatient).toBe(false);
  });

  it('Dado paciente sem CPF e sem pagador, Quando resolver, Então bloqueia com orientação', () => {
    expect(() =>
      resolveReceiptParties({
        clinic,
        patient: { fullName: 'Maria Souza', cpf: null },
      }),
    ).toThrow(MISSING_PATIENT_CPF_MESSAGE);
  });

  it.each([[null], [undefined], ['  ']])(
    'Dado empresa com CNPJ %j, Quando resolver, Então bloqueia com orientação',
    (cnpj) => {
      const attempt = () =>
        resolveReceiptParties({ clinic: { name: 'X', cnpj }, patient });
      expect(attempt).toThrow(ValidationError);
      expect(attempt).toThrow(MISSING_PROVIDER_DOCUMENT_MESSAGE);
    },
  );

  it('Dado CNPJ e CPF ausentes, Então o CNPJ é cobrado primeiro', () => {
    expect(() =>
      resolveReceiptParties({
        clinic: { name: 'X', cnpj: null },
        patient: { fullName: 'M', cpf: null },
      }),
    ).toThrow(MISSING_PROVIDER_DOCUMENT_MESSAGE);
  });

  it('Dado CNPJ marcado para correção (#358), Quando resolver, Então bloqueia; sem marca emite; sem CNPJ cobra o CNPJ primeiro', () => {
    const marked = { ...clinic, cnpjReviewSince: new Date() };

    expect(() => resolveReceiptParties({ clinic: marked, patient })).toThrow(
      CNPJ_UNDER_REVIEW_MESSAGE,
    );
    expect(() =>
      resolveReceiptParties({
        clinic: { ...clinic, cnpjReviewSince: null },
        patient,
      }),
    ).not.toThrow();
    expect(() =>
      resolveReceiptParties({
        clinic: { name: 'X', cnpj: null, cnpjReviewSince: new Date() },
        patient,
      }),
    ).toThrow(MISSING_PROVIDER_DOCUMENT_MESSAGE);
  });
});
