import { describe, expect, it } from 'vitest';
import {
  EMPTY_PRESCRIPTION_MESSAGE,
  FREE_TEXT_TOO_LONG_MESSAGE,
  NursingPrescription,
  normalizeFreeText,
  PRESCRIPTION_FREE_TEXT_MAX,
  type PrescriptionContent,
} from '@/domain/clinical/nursing-prescription';
import { ValidationError } from '@/domain/shared/errors';

/** Receituário emitido (#956, ADR-116): conteúdo congelado na emissão. */

const content = (
  overrides: Partial<PrescriptionContent> = {},
): PrescriptionContent => ({
  issuer: {
    name: 'Clínica Pele',
    document: { label: 'CNPJ', value: '11.222.333/0001-81' },
    registry: null,
    address: 'Rua A, 1',
  },
  city: 'Campinas',
  patientName: 'Maria',
  items: [{ label: 'Cuidados com lesões', frequency: 'diária' }],
  freeText: null,
  signer: { name: 'Enf. Ana', registry: 'COREN-SP 1' },
  ...overrides,
});

const props = (overrides: Partial<PrescriptionContent> = {}) => ({
  carePlanId: 'plano-1',
  patientId: 'paciente-1',
  issuedBy: 'ana@clinica.com',
  content: content(overrides),
});

describe('Feature: receituário emitido (#956, ADR-116)', () => {
  it('Dados válidos, Quando cria, Então guarda o conteúdo com observações aparadas e numera RCT pelo id', () => {
    const before = Date.now();

    const prescription = NursingPrescription.create(
      props({ freeText: '  Manter a pele seca.  ' }),
    );

    expect(prescription.carePlanId).toBe('plano-1');
    expect(prescription.patientId).toBe('paciente-1');
    expect(prescription.issuedBy).toBe('ana@clinica.com');
    expect(prescription.issuedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(prescription.content).toEqual(
      content({ freeText: 'Manter a pele seca.' }),
    );
    expect(prescription.documentNumber).toBe(
      `RCT-${prescription.id.slice(0, 8).toUpperCase()}`,
    );
    expect(prescription.documentNumber).toMatch(/^RCT-[0-9A-F]{8}$/);
  });

  it.each([
    ['carePlanId', ' ', 'Plano de cuidados é obrigatório'],
    ['patientId', '', 'Paciente é obrigatório'],
    ['issuedBy', '  ', 'Quem emite é obrigatório'],
  ])(
    'Dado %s em branco, Quando cria, Então recusa',
    (field, value, message) => {
      const attempt = () =>
        NursingPrescription.create({ ...props(), [field]: value });

      expect(attempt).toThrow(ValidationError);
      expect(attempt).toThrow(message);
    },
  );

  it('Dado plano sem intervenção, Quando cria, Então recusa o receituário vazio', () => {
    expect(() => NursingPrescription.create(props({ items: [] }))).toThrow(
      EMPTY_PRESCRIPTION_MESSAGE,
    );
  });

  it('Dadas observações no limite, Quando normaliza, Então aceita; acima dele, recusa', () => {
    const atLimit = 'a'.repeat(PRESCRIPTION_FREE_TEXT_MAX);

    expect(PRESCRIPTION_FREE_TEXT_MAX).toBe(2000);
    expect(normalizeFreeText(atLimit)).toBe(atLimit);
    expect(normalizeFreeText(` ${atLimit} `)).toBe(atLimit);
    expect(() => normalizeFreeText(`${atLimit}a`)).toThrow(
      FREE_TEXT_TOO_LONG_MESSAGE,
    );
    expect(FREE_TEXT_TOO_LONG_MESSAGE).toBe(
      'As observações do receituário têm no máximo 2000 caracteres.',
    );
  });

  it.each([
    [null, null],
    ['', null],
    ['   ', null],
    [' a ', 'a'],
  ])(
    'Dadas observações %j, Quando normaliza, Então vira %j',
    (value, expected) => {
      expect(normalizeFreeText(value)).toBe(expected);
    },
  );

  it('Dado emitido, Quando compara com o mesmo conteúdo, Então é igual mesmo com observações só diferentes em espaço', () => {
    const prescription = NursingPrescription.create(props({ freeText: 'a' }));

    expect(prescription.hasSameContent(content({ freeText: ' a ' }))).toBe(
      true,
    );
    expect(prescription.hasSameContent(content({ freeText: 'b' }))).toBe(false);
    expect(
      prescription.hasSameContent(
        content({ items: [{ label: 'Outra', frequency: 'diária' }] }),
      ),
    ).toBe(false);
  });

  it('Dado anonimizado (sem conteúdo), Quando compara, Então nunca é igual e o número fica', () => {
    const anonymized = NursingPrescription.restore({
      id: 'abcdef1234567890',
      carePlanId: 'plano-1',
      patientId: 'paciente-1',
      issuedBy: 'ana@clinica.com',
      issuedAt: new Date('2026-01-01T00:00:00Z'),
      content: null,
    });

    expect(anonymized.content).toBeNull();
    expect(anonymized.documentNumber).toBe('RCT-ABCDEF12');
    expect(anonymized.hasSameContent(content())).toBe(false);
  });
});
