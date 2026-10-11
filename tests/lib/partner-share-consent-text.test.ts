import { describe, expect, it } from 'vitest';
import {
  PARTNER_SHARE_CONSENT,
  PARTNER_SHARE_CONSENT_TEXT,
  PARTNER_SHARE_CONSENT_TEXT_VERSION,
} from '@/lib/partner-share-consent-text';

describe('Feature: Texto do consentimento para o parceiro (#292)', () => {
  it('Dado o texto provisório, Então a versão marca placeholder até o texto do jurídico (#216)', () => {
    expect(PARTNER_SHARE_CONSENT_TEXT_VERSION).toBe('v0-placeholder');
    expect(PARTNER_SHARE_CONSENT_TEXT).toContain(
      `(${PARTNER_SHARE_CONSENT_TEXT_VERSION})`,
    );
    expect(PARTNER_SHARE_CONSENT_TEXT).toContain('Texto provisório');
  });

  it('Dado o texto, Então cita a janela de 24 meses e a revogação', () => {
    expect(PARTNER_SHARE_CONSENT_TEXT).toContain('24 meses');
    expect(PARTNER_SHARE_CONSENT_TEXT).toContain('revogá-la');
  });

  it('Dado o par exportado, Então texto e versão são os vigentes', () => {
    expect(PARTNER_SHARE_CONSENT).toEqual({
      text: PARTNER_SHARE_CONSENT_TEXT,
      version: PARTNER_SHARE_CONSENT_TEXT_VERSION,
    });
  });
});
