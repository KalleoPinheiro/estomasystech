import { describe, expect, it } from 'vitest';
import { hashConsentText } from '@/domain/consent/consent-record';
import {
  PartnerShareConsent,
  type PartnerShareConsentState,
} from '@/domain/consent/partner-share-consent';
import { ValidationError } from '@/domain/shared/errors';

const TEXT = 'texto v1';

const restore = (
  overrides: Partial<PartnerShareConsentState>,
): PartnerShareConsent =>
  PartnerShareConsent.restore({
    id: Math.random().toString(36),
    patientId: 'pat-1',
    partnerId: 'par-1',
    kind: 'accept',
    textHash: hashConsentText(TEXT),
    textVersion: 'v1',
    actor: 'patient',
    recordedBy: null,
    ipAddress: null,
    recordedAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  });

describe('Feature: Consentimento paciente × parceiro (#292)', () => {
  describe('Cenário: criação', () => {
    it('Dado aceite válido, Então grava hash do texto, versão, IP e ator paciente', () => {
      const record = PartnerShareConsent.accept({
        patientId: 'pat-1',
        partnerId: 'par-1',
        consentText: TEXT,
        textVersion: 'v1',
        ipAddress: ' 10.0.0.1 ',
      });

      expect(record.kind).toBe('accept');
      expect(record.textHash).toBe(hashConsentText(TEXT));
      expect(record.textVersion).toBe('v1');
      expect(record.actor).toBe('patient');
      expect(record.ipAddress).toBe('10.0.0.1');
      expect(record.id).toBeTruthy();
      expect(record.patientId).toBe('pat-1');
      expect(record.partnerId).toBe('par-1');
      expect(record.recordedAt).toBeInstanceOf(Date);
    });

    it('Dado aceite em papel, Então guarda hash, ator equipe, origem papel e quem lançou', () => {
      const record = PartnerShareConsent.acceptOnPaper({
        patientId: 'pat-1',
        partnerId: 'par-1',
        consentText: TEXT,
        textVersion: 'v1',
        recordedBy: ' recepcao@clinica.com ',
        ipAddress: '10.0.0.2',
      });

      expect(record.kind).toBe('accept');
      expect(record.actor).toBe('staff');
      expect(record.source).toBe('paper');
      expect(record.recordedBy).toBe('recepcao@clinica.com');
      expect(record.textHash).toBe(hashConsentText(TEXT));
      expect(
        PartnerShareConsent.resolveStatus([record], 'par-1', TEXT).active,
      ).toBe(true);
    });

    it('Dado aceite pelo portal, Então a origem é portal e ninguém da equipe lançou', () => {
      const record = PartnerShareConsent.accept({
        patientId: 'pat-1',
        partnerId: 'par-1',
        consentText: TEXT,
        textVersion: 'v1',
      });

      expect(record.source).toBe('portal');
      expect(record.recordedBy).toBeNull();
    });

    it('Dado aceite em papel sem quem lançou, Então ValidationError', () => {
      expect(() =>
        PartnerShareConsent.acceptOnPaper({
          patientId: 'pat-1',
          partnerId: 'par-1',
          consentText: TEXT,
          textVersion: 'v1',
          recordedBy: '  ',
        }),
      ).toThrow(ValidationError);
    });

    it('Dado revogação pela equipe, Então sem hash nem versão e ator equipe', () => {
      const record = PartnerShareConsent.revoke({
        patientId: 'pat-1',
        partnerId: 'par-1',
        actor: 'staff',
      });

      expect(record.kind).toBe('revoke');
      expect(record.textHash).toBe('');
      expect(record.textVersion).toBeNull();
      expect(record.actor).toBe('staff');
      expect(record.ipAddress).toBeNull();
    });

    it.each([
      [{ patientId: ' ' }, 'Paciente é obrigatório'],
      [{ partnerId: '' }, 'Parceiro é obrigatório'],
      [{ consentText: ' ' }, 'Texto do consentimento é obrigatório'],
      [{ textVersion: '' }, 'Versão do consentimento é obrigatória'],
    ])(
      'Dado aceite com %o, Então ValidationError "%s"',
      (override, message) => {
        expect(() =>
          PartnerShareConsent.accept({
            patientId: 'pat-1',
            partnerId: 'par-1',
            consentText: TEXT,
            textVersion: 'v1',
            ...override,
          }),
        ).toThrow(new ValidationError(message));
      },
    );

    it('Dado revogação sem parceiro, Então ValidationError', () => {
      expect(() =>
        PartnerShareConsent.revoke({
          patientId: 'pat-1',
          partnerId: ' ',
          actor: 'patient',
        }),
      ).toThrow(ValidationError);
    });
  });

  describe('Cenário: status', () => {
    it('Dado sem registros, Então inativo e sem histórico', () => {
      expect(PartnerShareConsent.resolveStatus([], 'par-1', TEXT)).toEqual({
        active: false,
        current: null,
        latestAccept: null,
        representativeExpired: false,
      });
    });

    it('Dado aceite do texto vigente, Então ativo', () => {
      const accept = restore({});
      const status = PartnerShareConsent.resolveStatus([accept], 'par-1', TEXT);

      expect(status.active).toBe(true);
      expect(status.current).toBe(accept);
      expect(status.latestAccept).toBe(accept);
    });

    it('Dado aceite seguido de revogação, Então inativo, mas guarda o último aceite', () => {
      const accept = restore({});
      const revoke = restore({
        kind: 'revoke',
        textHash: '',
        textVersion: null,
        recordedAt: new Date('2026-02-01T10:00:00Z'),
      });
      const status = PartnerShareConsent.resolveStatus(
        [revoke, accept],
        'par-1',
        TEXT,
      );

      expect(status.active).toBe(false);
      expect(status.current).toBe(revoke);
      expect(status.latestAccept).toBe(accept);
    });

    it('Dado revogação seguida de novo aceite, Então ativo', () => {
      const status = PartnerShareConsent.resolveStatus(
        [
          restore({ kind: 'revoke', textHash: '' }),
          restore({ recordedAt: new Date('2026-03-01T10:00:00Z') }),
        ],
        'par-1',
        TEXT,
      );

      expect(status.active).toBe(true);
    });

    it('Dado aceite e revogação no mesmo milissegundo, Então a revogação vence', () => {
      const status = PartnerShareConsent.resolveStatus(
        [restore({}), restore({ kind: 'revoke', textHash: '' })],
        'par-1',
        TEXT,
      );

      expect(status.active).toBe(false);
      expect(status.current?.kind).toBe('revoke');
    });

    it('Dado aceite de texto antigo, Então inativo (texto mudou, novo aceite)', () => {
      const status = PartnerShareConsent.resolveStatus(
        [restore({ textHash: hashConsentText('texto v0') })],
        'par-1',
        TEXT,
      );

      expect(status.active).toBe(false);
      expect(status.latestAccept).not.toBeNull();
    });

    it('Dado aceite para outro parceiro, Então não vale para este', () => {
      const status = PartnerShareConsent.resolveStatus(
        [restore({ partnerId: 'par-antigo' })],
        'par-1',
        TEXT,
      );

      expect(status).toEqual({
        active: false,
        current: null,
        latestAccept: null,
        representativeExpired: false,
      });
    });
  });
});

describe('Feature: autorização do parceiro pelo representante do menor (#375)', () => {
  const signer = { guardianId: 'g-1', relationship: 'mae' };
  const minor = { birthDate: new Date('2015-01-01T00:00:00Z') };
  const expiredAdult = { birthDate: new Date('2000-01-01T00:00:00Z') };
  const NOW = new Date('2026-10-18T15:00:00Z');

  it('grava quem assinou no aceite e na revogação', () => {
    const accept = PartnerShareConsent.accept({
      patientId: 'pat-1',
      partnerId: 'par-1',
      consentText: TEXT,
      textVersion: 'v1',
      ipAddress: null,
      signer,
    });
    const revoke = PartnerShareConsent.revoke({
      patientId: 'pat-1',
      partnerId: 'par-1',
      actor: 'patient',
      ipAddress: null,
      signer,
    });
    expect(accept.signer).toEqual(signer);
    expect(revoke.signer).toEqual(signer);
    expect(
      PartnerShareConsent.acceptOnPaper({
        patientId: 'pat-1',
        partnerId: 'par-1',
        consentText: TEXT,
        textVersion: 'v1',
        recordedBy: 'staff-1',
        ipAddress: null,
      }).signer,
    ).toBeNull();
  });

  it('vale para o menor e vence 90 dias depois dos 18; sem titular, não vale', () => {
    const records = [
      restore({ signerGuardianId: 'g-1', signerRelationship: 'mae' }),
    ];
    const status = (holder?: { birthDate: Date | null }) =>
      PartnerShareConsent.resolveStatus(records, 'par-1', TEXT, holder, NOW);
    expect(status(minor)).toMatchObject({
      active: true,
      representativeExpired: false,
    });
    expect(status(expiredAdult)).toMatchObject({
      active: false,
      representativeExpired: true,
    });
    expect(status()).toMatchObject({ active: false });
  });

  it('o aceite do próprio paciente não vence', () => {
    expect(
      PartnerShareConsent.resolveStatus(
        [restore({})],
        'par-1',
        TEXT,
        expiredAdult,
        NOW,
      ),
    ).toMatchObject({ active: true, representativeExpired: false });
  });
});
