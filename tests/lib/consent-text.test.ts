import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from '@/lib/consent-text';
import {
  IMAGE_CONSENT_TEXT,
  IMAGE_CONSENT_TEXT_VERSION,
} from '@/lib/image-consent-text';

const flat = (text: string) => text.replace(/\s+/g, ' ');

describe('Feature: Texto-base do TCLE de tratamento (#216, ADR-030)', () => {
  it("Dado o texto do consentimento, Quando ler a versão, Então é 'v3' (v1 misturava imagem e tratamento)", () => {
    expect(CONSENT_TEXT_VERSION).toBe('v3');
  });

  it('Dado o texto do consentimento, Quando ler o conteúdo, Então inclui a versão no cabeçalho e os marcadores da clínica', () => {
    expect(CONSENT_TEXT).toContain(`(${CONSENT_TEXT_VERSION})`);
    expect(CONSENT_TEXT).toContain(
      'TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO',
    );
    for (const marker of [
      '{{CLINICA_NOME}}',
      '{{CLINICA_CNPJ}}',
      '{{ENCARREGADO_NOME}}',
      '{{ENCARREGADO_CONTATO}}',
    ]) {
      expect(CONSENT_TEXT).toContain(marker);
    }
  });

  it('Dado o TCLE, Quando ler o conteúdo, Então cita a LGPD e deixa foto e parceiro para termos à parte', () => {
    expect(flat(CONSENT_TEXT)).toContain('Lei Geral de Proteção de Dados');
    expect(flat(CONSENT_TEXT)).toContain('Lei nº 13.709/2018');
    expect(flat(CONSENT_TEXT)).toContain(
      'não autoriza o registro ou o uso de fotos',
    );
    expect(CONSENT_TEXT).not.toContain('Autorizo o registro fotográfico');
  });

  it('Dado o texto do consentimento, Quando calcular hash SHA-256, Então é estável (mesmo texto, mesmo hash)', () => {
    const hash1 = createHash('sha256').update(CONSENT_TEXT).digest('hex');
    const hash2 = createHash('sha256').update(CONSENT_TEXT).digest('hex');

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Feature: Texto-base da autorização de imagem (#216, ADR-030)', () => {
  it('Dado o termo de imagem, Então tem versão própria, cabeçalho e os marcadores da clínica', () => {
    expect(IMAGE_CONSENT_TEXT_VERSION).toBe('v1');
    expect(IMAGE_CONSENT_TEXT).toContain(`(${IMAGE_CONSENT_TEXT_VERSION})`);
    expect(IMAGE_CONSENT_TEXT).toContain('{{CLINICA_NOME}}');
    expect(IMAGE_CONSENT_TEXT).toContain('{{ENCARREGADO_CONTATO}}');
  });

  it('Dado o termo de imagem, Então limita o uso ao tratamento e exclui divulgação e aulas', () => {
    expect(IMAGE_CONSENT_TEXT).toContain('Para que as fotos NÃO servem');
    expect(IMAGE_CONSENT_TEXT).toContain('divulgação');
    expect(flat(IMAGE_CONSENT_TEXT)).toContain('Lei nº 13.709/2018');
  });

  it('Dado os dois termos, Então os textos-base são diferentes (hashes independentes)', () => {
    expect(IMAGE_CONSENT_TEXT).not.toBe(CONSENT_TEXT);
  });
});
