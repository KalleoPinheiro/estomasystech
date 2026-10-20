import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConsentRecord,
  hashConsentText,
} from '@/domain/consent/consent-record';
import { PartnerShareConsent } from '@/domain/consent/partner-share-consent';
import { Professional } from '@/domain/professional/professional';
import { parseBrazilianPhone } from '@/domain/shared/phone';
import { appTimeZone, DEFAULT_APP_TIMEZONE } from '@/domain/shared/time-zone';

const TEXT = 'Termo de consentimento vigente';
const AT = new Date('2026-03-01T10:00:00.000Z');

const consent = (kind: 'accept' | 'revoke') =>
  ConsentRecord.restore({
    id: `c-${kind}`,
    patientId: 'pac-1',
    kind,
    purpose: 'treatment',
    textHash: kind === 'accept' ? hashConsentText(TEXT) : '',
    textVersion: kind === 'accept' ? 'v1' : null,
    controllerSnapshot: null,
    ipAddress: null,
    acceptedAt: AT,
  });

describe('Feature: Empate de milissegundo entre aceite e revogação (LGPD, desfecho mais restritivo)', () => {
  it.each([
    ['aceite antes da revogação', ['accept', 'revoke'] as const],
    ['revogação antes do aceite', ['revoke', 'accept'] as const],
  ])(
    'Dado %s no mesmo instante do termo do paciente, Quando resolver o status, Então vale a revogação',
    (_nome, ordem) => {
      const status = ConsentRecord.resolveStatus(
        ordem.map(consent),
        TEXT,
        'treatment',
      );
      expect(status.accepted).toBe(false);
      expect(status.current?.kind).toBe('revoke');
      expect(status.latestAccept?.kind).toBe('accept');
    },
  );

  const partner = (kind: 'accept' | 'revoke') =>
    PartnerShareConsent.restore({
      id: `p-${kind}`,
      patientId: 'pac-1',
      partnerId: 'par-1',
      kind,
      textHash: kind === 'accept' ? hashConsentText(TEXT) : '',
      textVersion: kind === 'accept' ? 'v1' : null,
      actor: 'patient',
      recordedBy: null,
      ipAddress: null,
      recordedAt: AT,
    });

  it.each([
    ['aceite antes da revogação', ['accept', 'revoke'] as const],
    ['revogação antes do aceite', ['revoke', 'accept'] as const],
  ])(
    'Dado %s no mesmo instante do compartilhamento com parceiro, Quando resolver, Então o compartilhamento fica inativo',
    (_nome, ordem) => {
      const status = PartnerShareConsent.resolveStatus(
        ordem.map(partner),
        'par-1',
        TEXT,
      );
      expect(status.active).toBe(false);
      expect(status.current?.kind).toBe('revoke');
    },
  );

  it('Dado representante sem parentesco informado, Quando ler o signatário, Então o parentesco é vazio', () => {
    const record = PartnerShareConsent.restore({
      id: 'p-1',
      patientId: 'pac-1',
      partnerId: 'par-1',
      kind: 'accept',
      textHash: hashConsentText(TEXT),
      textVersion: 'v1',
      actor: 'patient',
      recordedBy: null,
      ipAddress: null,
      recordedAt: AT,
      signerGuardianId: 'resp-1',
      signerRelationship: null,
    });
    expect(record.signer).toEqual({ guardianId: 'resp-1', relationship: '' });
  });
});

describe('Feature: Repasse do profissional sem valor configurado', () => {
  it('Dado profissional por percentual sem percentual definido, Quando ler a regra, Então não há repasse', () => {
    const professional = Professional.create({
      fullName: 'Enf. Beatriz Lima',
      commissionType: 'percentage',
    });
    expect(professional.commissionRule).toBeNull();
  });
});

describe('Feature: Repasse fixo legado sem valor gravado', () => {
  it('Dado profissional restaurado com repasse fixo sem valor, Quando ler a regra, Então não há repasse', () => {
    const professional = Professional.restore({
      id: 'prof-1',
      fullName: 'Enf. Beatriz Lima',
      active: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      commissionType: 'fixed',
      commissionFixedCents: null,
    });
    expect(professional.commissionRule).toBeNull();
  });
});

describe('Feature: Telefone com zero de tronco inválido', () => {
  it('Dado número iniciado em 0 cujo restante não tem 10 ou 11 dígitos, Quando validar, Então recusa por tamanho', () => {
    const result = parseBrazilianPhone('0123');
    expect(result.ok).toBe(false);
  });
});

describe('Feature: Fuso da aplicação fora do Node', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Dado ambiente sem objeto process (navegador), Quando consultar o fuso, Então usa o padrão de São Paulo', () => {
    vi.stubGlobal('process', undefined);
    expect(appTimeZone()).toBe(DEFAULT_APP_TIMEZONE);
  });
});
