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
      });
    });
  });
});
