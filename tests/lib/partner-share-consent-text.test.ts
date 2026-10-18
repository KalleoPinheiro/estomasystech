import { describe, expect, it } from 'vitest';
import {
  PARTNER_SHARE_CONSENT,
  PARTNER_SHARE_CONSENT_TEXT,
  PARTNER_SHARE_CONSENT_TEXT_VERSION,
} from '@/lib/partner-share-consent-text';

describe('Feature: Texto do consentimento para o parceiro (#292, #216)', () => {
  it('Dado o texto vigente, Então a versão é v1, sem aviso de texto provisório', () => {
    expect(PARTNER_SHARE_CONSENT_TEXT_VERSION).toBe('v1');
    expect(PARTNER_SHARE_CONSENT_TEXT).toContain(
      `(${PARTNER_SHARE_CONSENT_TEXT_VERSION})`,
    );
    expect(PARTNER_SHARE_CONSENT_TEXT).not.toContain('provisório');
  });

  it('Dado o texto, Então cita a janela de 24 meses, a revogação e o que o parceiro vê sem autorização', () => {
    expect(PARTNER_SHARE_CONSENT_TEXT).toContain('24 meses');
    expect(PARTNER_SHARE_CONSENT_TEXT).toContain(
      'Posso retirar esta autorização',
    );
    expect(PARTNER_SHARE_CONSENT_TEXT).toContain('apenas que fui atendido(a)');
  });

  it('Dado o texto, Então é fixo: sem marcadores da clínica nem do parceiro', () => {
    expect(PARTNER_SHARE_CONSENT_TEXT).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('Dado o par exportado, Então texto e versão são os vigentes', () => {
    expect(PARTNER_SHARE_CONSENT).toEqual({
      text: PARTNER_SHARE_CONSENT_TEXT,
      version: PARTNER_SHARE_CONSENT_TEXT_VERSION,
    });
  });
});
