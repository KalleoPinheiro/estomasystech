import { describe, expect, it } from 'vitest';
import {
  ConsentRecord,
  isConsentPurpose,
} from '@/domain/consent/consent-record';

const accept = (purpose: 'treatment' | 'image', text: string, at: number) => {
  const record = ConsentRecord.create({
    patientId: 'p-1',
    consentText: text,
    textVersion: 'v1',
    purpose,
    controllerSnapshot: ' Clínica · CNPJ 1 ',
  });
  return ConsentRecord.restore({
    id: record.id,
    patientId: record.patientId,
    kind: 'accept',
    purpose,
    textHash: record.textHash,
    textVersion: 'v1',
    controllerSnapshot: record.controllerSnapshot,
    ipAddress: null,
    acceptedAt: new Date(at),
  });
};

describe('Feature: Finalidade do consentimento (#216, ADR-030)', () => {
  it('Dado aceite sem finalidade, Então vale tratamento e não guarda snapshot', () => {
    const record = ConsentRecord.create({
      patientId: 'p-1',
      consentText: 'Termo',
      textVersion: 'v1',
    });

    expect(record.purpose).toBe('treatment');
    expect(record.controllerSnapshot).toBeNull();
  });

  it('Dado aceite de imagem com snapshot, Então grava a finalidade e o snapshot sem espaços sobrando', () => {
    const record = accept('image', 'Imagem', 1);

    expect(record.purpose).toBe('image');
    expect(record.controllerSnapshot).toBe('Clínica · CNPJ 1');
  });

  it('Dada revogação, Então leva a finalidade e nunca snapshot', () => {
    const revoke = ConsentRecord.revoke({ patientId: 'p-1', purpose: 'image' });

    expect(revoke.purpose).toBe('image');
    expect(revoke.controllerSnapshot).toBeNull();
    expect(ConsentRecord.revoke({ patientId: 'p-1' }).purpose).toBe(
      'treatment',
    );
  });

  it('Dada linha legada sem finalidade, Quando restaurar, Então é tratamento', () => {
    const legacy = ConsentRecord.restore({
      id: 'old',
      patientId: 'p-1',
      textHash: 'abc',
      ipAddress: null,
      acceptedAt: new Date(0),
    });

    expect(legacy.purpose).toBe('treatment');
    expect(legacy.kind).toBe('accept');
  });

  it('Dados aceites das duas finalidades, Quando resolver o status, Então cada uma vê só os seus registros', () => {
    const treatment = accept('treatment', 'Tratamento', 1);
    const image = accept('image', 'Imagem', 2);
    const records = [treatment, image];

    expect(ConsentRecord.resolveStatus(records, 'Tratamento').accepted).toBe(
      true,
    );
    expect(
      ConsentRecord.resolveStatus(records, 'Imagem', 'image').accepted,
    ).toBe(true);
    // O texto de uma finalidade não vale para a outra.
    expect(ConsentRecord.resolveStatus(records, 'Imagem').accepted).toBe(false);
  });

  it('Dada revogação da imagem, Então o tratamento continua aceito', () => {
    const treatment = accept('treatment', 'Tratamento', 1);
    const image = accept('image', 'Imagem', 2);
    const revoke = ConsentRecord.revoke({ patientId: 'p-1', purpose: 'image' });
    const revokeAfter = ConsentRecord.restore({
      id: revoke.id,
      patientId: 'p-1',
      kind: 'revoke',
      purpose: 'image',
      textHash: '',
      textVersion: null,
      controllerSnapshot: null,
      ipAddress: null,
      acceptedAt: new Date(3),
    });
    const records = [treatment, image, revokeAfter];

    expect(
      ConsentRecord.resolveStatus(records, 'Imagem', 'image').accepted,
    ).toBe(false);
    expect(ConsentRecord.resolveStatus(records, 'Tratamento').accepted).toBe(
      true,
    );
  });

  it('Dado valor qualquer, Quando checar a finalidade, Então só treatment e image valem', () => {
    expect(isConsentPurpose('image')).toBe(true);
    expect(isConsentPurpose('treatment')).toBe(true);
    expect(isConsentPurpose('marketing')).toBe(false);
    expect(isConsentPurpose(null)).toBe(false);
  });
});

describe('Feature: quem assinou pelo menor (#372)', () => {
  it('Dado o representante, Quando aceitar e revogar, Então o registro guarda o cadastro e o parentesco', () => {
    const signer = { guardianId: 'g-1', relationship: 'mae' };
    const accept = ConsentRecord.create({
      patientId: 'p-1',
      consentText: 'texto',
      textVersion: 'v2',
      signer,
    });
    const revoke = ConsentRecord.revoke({ patientId: 'p-1', signer });
    expect(accept.signer).toEqual(signer);
    expect(revoke.signer).toEqual(signer);
  });

  it('Dado o próprio paciente ou linha legada, Então não há representante', () => {
    expect(
      ConsentRecord.create({
        patientId: 'p-1',
        consentText: 'texto',
        textVersion: 'v2',
      }).signer,
    ).toBeNull();
    expect(
      ConsentRecord.restore({
        id: 'c-1',
        patientId: 'p-1',
        textHash: 'h',
        ipAddress: null,
        acceptedAt: new Date(),
        signerGuardianId: 'g-1',
        signerRelationship: null,
      }).signer,
    ).toEqual({ guardianId: 'g-1', relationship: '' });
  });
});
