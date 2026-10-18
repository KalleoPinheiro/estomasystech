import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ConsentRecord,
  hashConsentText,
} from '@/domain/consent/consent-record';
import { ValidationError } from '@/domain/shared/errors';

const validInput = {
  patientId: 'patient-1',
  consentText: 'Termo de consentimento para monitoramento remoto.',
  textVersion: 'v1',
  ipAddress: '203.0.113.10',
};

describe('Feature: Aceite digital do termo de consentimento', () => {
  describe('Cenário: registrar aceite válido', () => {
    it('Dado dados válidos, Quando criar, Então aceite com hash SHA-256 do texto', () => {
      const record = ConsentRecord.create(validInput);

      const expectedHash = createHash('sha256')
        .update(validInput.consentText, 'utf8')
        .digest('hex');

      expect(record.id).toBeTruthy();
      expect(record.patientId).toBe('patient-1');
      expect(record.kind).toBe('accept');
      expect(record.textHash).toBe(expectedHash);
      expect(record.textVersion).toBe('v1');
      expect(record.ipAddress).toBe('203.0.113.10');
      expect(record.acceptedAt).toBeInstanceOf(Date);
    });

    it('Dado ipAddress omitido, Quando criar, Então ipAddress é nulo', () => {
      const record = ConsentRecord.create({
        patientId: 'patient-1',
        consentText: 'Termo',
        textVersion: 'v1',
      });

      expect(record.ipAddress).toBeNull();
    });

    it('Dado ipAddress com espaços, Quando criar, Então ipAddress é normalizado', () => {
      const record = ConsentRecord.create({
        ...validInput,
        ipAddress: '  203.0.113.10  ',
      });

      expect(record.ipAddress).toBe('203.0.113.10');
    });
  });

  describe('Cenário: rejeitar dados inválidos', () => {
    it('Dado patientId vazio, Quando criar, Então lança ValidationError', () => {
      expect(() =>
        ConsentRecord.create({ ...validInput, patientId: ' ' }),
      ).toThrow(ValidationError);
    });

    it('Dado texto do termo vazio, Quando criar, Então lança ValidationError', () => {
      expect(() =>
        ConsentRecord.create({ ...validInput, consentText: ' ' }),
      ).toThrow(ValidationError);
    });

    it('Dado textVersion vazio, Quando criar, Então lança ValidationError', () => {
      expect(() =>
        ConsentRecord.create({ ...validInput, textVersion: ' ' }),
      ).toThrow(ValidationError);
    });
  });

  describe('Cenário: verificar cobertura do aceite (covers)', () => {
    it('Dado o mesmo texto, Quando verificar covers, Então retorna true', () => {
      const record = ConsentRecord.create(validInput);

      expect(record.covers(validInput.consentText)).toBe(true);
    });

    it('Dado texto diferente, Quando verificar covers, Então retorna false', () => {
      const record = ConsentRecord.create(validInput);

      expect(record.covers('Texto do termo alterado')).toBe(false);
    });
  });

  describe('Cenário: reconstituir aceite da persistência', () => {
    it('Dado state completo, Quando restore, Então mantém id e hash', () => {
      const acceptedAt = new Date('2026-04-01T00:00:00Z');
      const record = ConsentRecord.restore({
        id: 'consent-1',
        patientId: 'patient-1',
        textHash: 'abc123',
        ipAddress: null,
        acceptedAt,
      });

      expect(record.id).toBe('consent-1');
      expect(record.textHash).toBe('abc123');
      expect(record.ipAddress).toBeNull();
      expect(record.acceptedAt).toEqual(acceptedAt);
    });

    it('Dado linha legada sem kind/textVersion, Quando restore, Então assume kind accept e textVersion nula', () => {
      const record = ConsentRecord.restore({
        id: 'consent-legacy',
        patientId: 'patient-1',
        textHash: 'abc123',
        ipAddress: null,
        acceptedAt: new Date('2026-01-01T00:00:00Z'),
      });

      expect(record.kind).toBe('accept');
      expect(record.textVersion).toBeNull();
    });

    it('Dado state completo com kind e textVersion, Quando restore, Então preserva os dois', () => {
      const record = ConsentRecord.restore({
        id: 'consent-2',
        patientId: 'patient-1',
        kind: 'revoke',
        textHash: '',
        textVersion: null,
        ipAddress: null,
        acceptedAt: new Date('2026-02-01T00:00:00Z'),
      });

      expect(record.kind).toBe('revoke');
      expect(record.textVersion).toBeNull();
    });
  });

  describe('Cenário: revogar consentimento (revoke)', () => {
    it('Dado patientId válido, Quando revogar, Então cria registro kind revoke sem hash de texto novo', () => {
      const record = ConsentRecord.revoke({
        patientId: 'patient-1',
        ipAddress: '203.0.113.10',
      });

      expect(record.id).toBeTruthy();
      expect(record.patientId).toBe('patient-1');
      expect(record.kind).toBe('revoke');
      expect(record.textHash).toBe('');
      expect(record.textVersion).toBeNull();
      expect(record.ipAddress).toBe('203.0.113.10');
      expect(record.acceptedAt).toBeInstanceOf(Date);
    });

    it('Dado patientId vazio, Quando revogar, Então lança ValidationError', () => {
      expect(() => ConsentRecord.revoke({ patientId: ' ' })).toThrow(
        ValidationError,
      );
    });

    it('Dado ipAddress omitido, Quando revogar, Então ipAddress é nulo', () => {
      const record = ConsentRecord.revoke({ patientId: 'patient-1' });

      expect(record.ipAddress).toBeNull();
    });
  });

  describe('Cenário: resolver status atual de consentimento (resolveStatus)', () => {
    const consentText = 'Termo vigente';

    it('Dado nenhum registro, Quando resolver status, Então não aceito e current nulo', () => {
      const status = ConsentRecord.resolveStatus([], consentText);

      expect(status.accepted).toBe(false);
      expect(status.current).toBeNull();
    });

    it('Dado revogação mais recente que o aceite, Quando resolver status, Então não aceito', () => {
      const accept = ConsentRecord.create({
        patientId: 'patient-1',
        consentText,
        textVersion: 'v1',
      });
      const revoke = ConsentRecord.restore({
        id: 'revoke-1',
        patientId: 'patient-1',
        kind: 'revoke',
        textHash: '',
        textVersion: null,
        ipAddress: null,
        acceptedAt: new Date(accept.acceptedAt.getTime() + 1000),
      });

      const status = ConsentRecord.resolveStatus([accept, revoke], consentText);

      expect(status.accepted).toBe(false);
      expect(status.current?.id).toBe('revoke-1');
    });

    it('Dado aceite mais recente cobrindo o texto vigente, Quando resolver status, Então aceito', () => {
      const accept = ConsentRecord.create({
        patientId: 'patient-1',
        consentText,
        textVersion: 'v1',
      });

      const status = ConsentRecord.resolveStatus([accept], consentText);

      expect(status.accepted).toBe(true);
      expect(status.current?.id).toBe(accept.id);
    });

    it('Dado aceite mais recente de versão/texto antigo, Quando resolver status, Então não aceito', () => {
      const staleAccept = ConsentRecord.create({
        patientId: 'patient-1',
        consentText: 'Termo antigo (v0)',
        textVersion: 'v0',
      });

      const status = ConsentRecord.resolveStatus([staleAccept], consentText);

      expect(status.accepted).toBe(false);
      expect(status.current?.id).toBe(staleAccept.id);
    });

    it('Dado paciente que revoga e depois aceita de novo, Quando resolver status, Então volta a aceito (revogação não é estado terminal)', () => {
      const firstAccept = ConsentRecord.create({
        patientId: 'patient-1',
        consentText,
        textVersion: 'v1',
      });
      const revoke = ConsentRecord.restore({
        id: 'revoke-2',
        patientId: 'patient-1',
        kind: 'revoke',
        textHash: '',
        textVersion: null,
        ipAddress: null,
        acceptedAt: new Date(firstAccept.acceptedAt.getTime() + 1000),
      });
      const secondAccept = ConsentRecord.restore({
        id: 'accept-2',
        patientId: 'patient-1',
        kind: 'accept',
        textHash: hashConsentText(consentText),
        textVersion: 'v1',
        ipAddress: null,
        acceptedAt: new Date(revoke.acceptedAt.getTime() + 1000),
      });

      const status = ConsentRecord.resolveStatus(
        [firstAccept, revoke, secondAccept],
        consentText,
      );

      expect(status.accepted).toBe(true);
      expect(status.current?.id).toBe('accept-2');
    });
  });
});

describe('Feature: Hash SHA-256 do texto de consentimento (hashConsentText)', () => {
  it('Dado um texto, Quando calcular hash, Então retorna o SHA-256 hexadecimal esperado', () => {
    const text = 'Texto de exemplo';

    expect(hashConsentText(text)).toBe(
      createHash('sha256').update(text, 'utf8').digest('hex'),
    );
  });
});

describe('Feature: termo aceito pelo representante do menor vence (#375)', () => {
  const NOW = new Date('2026-10-18T15:00:00Z');
  const signed = ConsentRecord.create({
    patientId: 'patient-1',
    consentText: 'Termo',
    textVersion: 'v1',
    signer: { guardianId: 'g-1', relationship: 'mae' },
  });
  const status = (holder?: { birthDate: Date | null }) =>
    ConsentRecord.resolveStatus([signed], 'Termo', 'treatment', holder, NOW);

  it('vale enquanto o titular é menor ou está nos 90 dias depois dos 18', () => {
    expect(
      status({ birthDate: new Date('2008-09-01T00:00:00Z') }),
    ).toMatchObject({ accepted: true, representativeExpired: false });
  });

  it('passado o prazo, ou sem o titular informado, deixa de valer', () => {
    expect(
      status({ birthDate: new Date('2008-01-01T00:00:00Z') }),
    ).toMatchObject({ accepted: false, representativeExpired: true });
    expect(status()).toMatchObject({ accepted: false });
    expect(status({ birthDate: null })).toMatchObject({ accepted: false });
  });

  it('o aceite do próprio paciente não vence', () => {
    const own = ConsentRecord.create({
      patientId: 'patient-1',
      consentText: 'Termo',
      textVersion: 'v1',
    });
    expect(
      ConsentRecord.resolveStatus([own], 'Termo', 'treatment', {
        birthDate: new Date('2000-01-01T00:00:00Z'),
      }),
    ).toMatchObject({ accepted: true, representativeExpired: false });
  });
});
