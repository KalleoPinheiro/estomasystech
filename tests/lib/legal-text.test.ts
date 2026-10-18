import { describe, expect, it } from 'vitest';
import { Clinic, type ClinicState } from '@/domain/clinic/clinic';
import { ConflictError } from '@/domain/shared/errors';
import {
  controllerFromClinic,
  controllerSnapshot,
  GENERIC_CONTROLLER,
  LEGAL_REVIEW_PENDING,
  renderLegalText,
} from '@/lib/legal-text';
import { PRIVACY_NOTICE_TEXT } from '@/lib/privacy-notice-text';

const clinic = (extra: Partial<ClinicState> = {}) =>
  Clinic.restore({
    id: 'c-1',
    name: ' Clínica Aurora ',
    createdBy: 'test',
    createdAt: new Date('2026-10-18T00:00:00Z'),
    cnpj: '12.345.678/0001-95',
    contactEmail: 'contato@aurora.test',
    contactPhone: '11 3333-4444',
    ...extra,
  });

describe('Feature: Controlador dos textos LGPD (#216, ADR-030)', () => {
  it('Dada clínica com encarregado, Quando montar o controlador, Então usa nome e canal dele', () => {
    const controller = controllerFromClinic(
      clinic({
        address: 'Rua das Flores, 100',
        city: 'São Paulo',
        professionalName: 'Enf. Ana',
        dpoName: 'Beatriz Lima',
        dpoContact: 'privacidade@aurora.test',
      }),
    );

    expect(controller).toEqual({
      name: 'Clínica Aurora',
      cnpj: '12.345.678/0001-95',
      address: 'Rua das Flores, 100, São Paulo',
      technicalLead: 'Enf. Ana',
      dpoName: 'Beatriz Lima',
      dpoContact: 'privacidade@aurora.test',
    });
  });

  it('Dada clínica sem encarregado, Quando montar o controlador, Então o canal é o e-mail de contato da clínica', () => {
    const controller = controllerFromClinic(clinic());

    expect(controller.dpoName).toBe('Responsável pela privacidade da clínica');
    expect(controller.dpoContact).toBe('contato@aurora.test');
    expect(controller.address).toBe(
      'endereço constante do cadastro da clínica',
    );
    expect(controller.technicalLead).toBe('responsável técnico da clínica');
  });

  it('Dada clínica só com telefone de contato, Então o telefone vira o canal', () => {
    const controller = controllerFromClinic(clinic({ contactEmail: null }));

    expect(controller.dpoContact).toBe('11 3333-4444');
  });

  it.each([
    ['sem CNPJ', { cnpj: null }],
    ['sem nenhum canal', { contactEmail: null, contactPhone: null }],
  ])(
    'Dada clínica %s, Quando montar o controlador, Então falha fechado com 409',
    (_label, extra) => {
      expect(() => controllerFromClinic(clinic(extra))).toThrow(ConflictError);
    },
  );
});

describe('Feature: Interpolação dos textos LGPD', () => {
  it('Dado o aviso de privacidade, Quando renderizar com a clínica, Então nenhum marcador sobra', () => {
    const text = renderLegalText(
      PRIVACY_NOTICE_TEXT,
      controllerFromClinic(
        clinic({ dpoName: 'Beatriz', dpoContact: 'dpo@x.test' }),
      ),
    );

    expect(text).not.toMatch(/\{\{/);
    expect(text).toContain('Clínica Aurora, CNPJ 12.345.678/0001-95');
    expect(text).toContain('Beatriz, dpo@x.test');
  });

  it('Dado o controlador genérico, Quando renderizar, Então o aviso público não nomeia clínica nenhuma', () => {
    const text = renderLegalText(PRIVACY_NOTICE_TEXT, GENERIC_CONTROLLER);

    expect(text).toContain('a clínica onde você se atende');
    expect(text).not.toMatch(/\{\{/);
  });

  it('Dado marcador desconhecido, Quando renderizar, Então falha em vez de exibir {{...}}', () => {
    expect(() => renderLegalText('Olá {{OUTRO}}', GENERIC_CONTROLLER)).toThrow(
      'Marcador desconhecido no texto legal: OUTRO',
    );
  });

  it('Dado o controlador, Quando montar a evidência do aceite, Então registra clínica, CNPJ e encarregado', () => {
    expect(controllerSnapshot(controllerFromClinic(clinic()))).toBe(
      'Clínica Aurora · CNPJ 12.345.678/0001-95 · Encarregado: Responsável pela privacidade da clínica (contato@aurora.test)',
    );
  });

  it('Dado o estado da revisão jurídica, Então segue pendente (a revisão é externa)', () => {
    expect(LEGAL_REVIEW_PENDING).toBe(true);
  });
});
