import { describe, expect, it } from 'vitest';
import { CONSENT_TEXT } from '@/lib/consent-text';
import {
  FALLBACKS,
  type LegalController,
  renderLegalText,
} from '@/lib/legal-text';
import { PRIVACY_NOTICE_TEXT } from '@/lib/privacy-notice-text';

const controller = (extra: Partial<LegalController> = {}): LegalController => ({
  name: 'Clínica Aurora',
  cnpj: '12.345.678/0001-95',
  address: 'Rua das Flores, 100',
  technicalLead: 'Enf. Ana',
  dpoName: 'Beatriz Lima',
  dpoContact: 'privacidade@aurora.test',
  ...extra,
});

describe('Feature: texto de preenchimento não vai impresso no termo (#469)', () => {
  it('Dado cadastro completo, Quando renderizar, Então imprime o encarregado e não o responsável técnico', () => {
    const text = renderLegalText(CONSENT_TEXT, controller());

    expect(text).not.toContain('Responsável técnico');
    expect(text).not.toContain('Enf. Ana');
    expect(text).toContain(
      'Encarregado pelos dados: Beatriz Lima, privacidade@aurora.test',
    );
  });

  it('Dado responsável técnico não cadastrado, Quando renderizar, Então a linha dele some', () => {
    const text = renderLegalText(
      CONSENT_TEXT,
      controller({ technicalLead: FALLBACKS.technicalLead }),
    );

    expect(text).not.toContain('Responsável técnico');
    expect(text).not.toContain(FALLBACKS.technicalLead);
    expect(text).toContain('Clínica: Clínica Aurora, CNPJ 12.345.678/0001-95');
  });

  it('Dado encarregado sem nome, Quando renderizar, Então fica só o canal de contato', () => {
    const text = renderLegalText(
      CONSENT_TEXT,
      controller({ dpoName: FALLBACKS.dpoName }),
    );

    expect(text).toContain('Encarregado pelos dados: privacidade@aurora.test');
    expect(text).not.toContain(FALLBACKS.dpoName);
  });

  it('Dado o aviso de privacidade e encarregado sem nome, Quando renderizar, Então também fica só o canal', () => {
    const text = renderLegalText(
      PRIVACY_NOTICE_TEXT,
      controller({ dpoName: FALLBACKS.dpoName }),
    );

    expect(text).not.toContain(FALLBACKS.dpoName);
    expect(text).toContain('privacidade@aurora.test.');
  });
});
