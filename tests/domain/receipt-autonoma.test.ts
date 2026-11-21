import { describe, expect, it } from 'vitest';
import {
  MISSING_BENEFICIARY_CPF_MESSAGE,
  MISSING_PROVIDER_CPF_MESSAGE,
  MISSING_PROVIDER_REGISTRY_MESSAGE,
  resolveReceiptParties,
} from '@/domain/billing/receipt';

const clinic = {
  name: 'Jeiciele Silva',
  kind: 'individual' as const,
  cpf: '52998224725',
  professionalRegistry: 'COREN-SP 123456',
};
const patient = { fullName: 'Maria Souza', cpf: '11144477735' };

describe('Feature: Recibo da profissional autônoma no modelo do Receita Saúde (#977)', () => {
  it('Dada autônoma e paciente pagante, Quando resolver, Então o prestador sai com CPF e COREN', () => {
    expect(resolveReceiptParties({ clinic, patient })).toEqual({
      provider: {
        name: 'Jeiciele Silva',
        document: '529.982.247-25',
        documentLabel: 'CPF',
        registry: 'COREN-SP 123456',
      },
      payer: { name: 'Maria Souza', document: '111.444.777-35' },
      payerIsPatient: true,
    });
  });

  it('Dada autônoma e outra pessoa pagando, Quando resolver, Então traz o CPF do paciente atendido como beneficiário', () => {
    const parties = resolveReceiptParties({
      clinic,
      patient,
      payer: { name: 'João Souza', cpf: '12345678909' },
    });

    expect(parties.payer).toEqual({
      name: 'João Souza',
      document: '123.456.789-09',
    });
    expect(parties.payerIsPatient).toBe(false);
    expect(parties.beneficiary).toEqual({
      name: 'Maria Souza',
      document: '111.444.777-35',
    });
  });

  it('Dada autônoma, outra pessoa pagando e paciente sem CPF, Quando resolver, Então bloqueia com orientação', () => {
    expect(() =>
      resolveReceiptParties({
        clinic,
        patient: { fullName: 'Maria Souza', cpf: null },
        payer: { name: 'João Souza', cpf: '12345678909' },
      }),
    ).toThrow(MISSING_BENEFICIARY_CPF_MESSAGE);
  });

  it('Dada autônoma sem CPF ou sem COREN, Quando resolver, Então bloqueia com orientação', () => {
    expect(() =>
      resolveReceiptParties({ clinic: { ...clinic, cpf: ' ' }, patient }),
    ).toThrow(MISSING_PROVIDER_CPF_MESSAGE);
    expect(() =>
      resolveReceiptParties({
        clinic: { ...clinic, professionalRegistry: null },
        patient,
      }),
    ).toThrow(MISSING_PROVIDER_REGISTRY_MESSAGE);
  });

  it('Dada autônoma com CNPJ antigo marcado para correção, Quando resolver, Então a marca do CNPJ não bloqueia o recibo com CPF', () => {
    const parties = resolveReceiptParties({
      clinic: { ...clinic, cnpj: null, cnpjReviewSince: new Date() },
      patient,
    });

    expect(parties.provider.documentLabel).toBe('CPF');
  });

  it('Dada clínica e outra pessoa pagando, Quando resolver, Então não há beneficiário nem rótulo de CPF', () => {
    const parties = resolveReceiptParties({
      clinic: { name: 'Clínica', cnpj: '12.345.678/0001-95' },
      patient: { fullName: 'Maria Souza', cpf: null },
      payer: { name: 'João Souza', cpf: '12345678909' },
    });

    expect(parties.beneficiary).toBeUndefined();
    expect(parties.provider).toEqual({
      name: 'Clínica',
      document: '12.345.678/0001-95',
    });
  });
});
