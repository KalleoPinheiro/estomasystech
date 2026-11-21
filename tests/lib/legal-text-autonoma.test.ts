import { describe, expect, it } from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import { BlindIndex, PROVIDER_INDEX_SCOPE } from '@/lib/blind-index';
import { CONSENT_TEXT } from '@/lib/consent-text';
import {
  controllerFromClinic,
  controllerSnapshot,
  renderLegalText,
} from '@/lib/legal-text';
import { PRIVACY_NOTICE_TEXT } from '@/lib/privacy-notice-text';

const individual = Clinic.restore({
  id: 'c-977',
  name: 'Jeiciele Silva',
  kind: 'individual',
  cpf: '52998224725',
  createdBy: 'test',
  createdAt: new Date('2026-11-20T00:00:00Z'),
  contactEmail: 'contato@jeiciele.test',
  professionalName: 'Jeiciele Silva',
});

describe('Feature: Termos LGPD da profissional autônoma (#977)', () => {
  it('Dada autônoma com CPF, Quando montar o controlador, Então o documento é o CPF formatado com o rótulo CPF', () => {
    const controller = controllerFromClinic(individual);

    expect(controller.cnpj).toBe('529.982.247-25');
    expect(controller.documentLabel).toBe('CPF');
    expect(controllerSnapshot(controller)).toBe(
      'Jeiciele Silva · CPF 529.982.247-25 · Encarregado: Responsável pela privacidade da clínica (contato@jeiciele.test)',
    );
  });

  it('Dada autônoma, Quando renderizar o TCLE, Então sai "Profissional" e "CPF" sem mexer no texto-base do aceite', () => {
    const before = CONSENT_TEXT;
    const text = renderLegalText(
      CONSENT_TEXT,
      controllerFromClinic(individual),
    );

    expect(text).toContain('Profissional: Jeiciele Silva, CPF 529.982.247-25');
    expect(text).not.toContain('CNPJ 529');
    expect(CONSENT_TEXT).toBe(before);
    expect(CONSENT_TEXT).toContain('CNPJ {{CLINICA_CNPJ}}');
  });

  it('Dada autônoma, Quando renderizar o aviso de privacidade, Então ela aparece como controladora pelo CPF', () => {
    const text = renderLegalText(
      PRIVACY_NOTICE_TEXT,
      controllerFromClinic(individual),
    );

    expect(text).toContain('Jeiciele Silva, CPF 529.982.247-25');
  });

  it('Dada autônoma sem CPF, Quando montar o controlador, Então falha fechado', () => {
    expect(() =>
      controllerFromClinic(individual.updateInfo({ cpf: null })),
    ).toThrow('CNPJ');
  });
});

describe('Feature: Índice cego do CPF da autônoma (#977)', () => {
  const blind = new BlindIndex({
    current: 'pepper-de-teste-do-indice-cego-0000000977',
  });

  it('Dado o mesmo CPF, Quando indexar como autônoma e como paciente, Então os hashes não colidem', () => {
    const provider = blind.hash(
      PROVIDER_INDEX_SCOPE,
      'provider-cpf',
      '529.982.247-25',
    );

    expect(provider).toBe(
      blind.hash(PROVIDER_INDEX_SCOPE, 'provider-cpf', '52998224725'),
    );
    expect(provider).not.toBe(
      blind.hash(PROVIDER_INDEX_SCOPE, 'cpf', '52998224725'),
    );
  });

  it('Dado CPF inválido, Quando indexar como autônoma, Então recusa', () => {
    expect(() =>
      blind.hash(PROVIDER_INDEX_SCOPE, 'provider-cpf', '52998224724'),
    ).toThrow('CPF inválido');
  });
});
