import { PDFPage } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type PrescriptionDocument,
  renderPrescriptionPdf,
} from '@/lib/documents/prescription-pdf';

/** Observações da prescritora no PDF (#956, ADR-116): depois dos itens, antes da assinatura. */

const base: PrescriptionDocument = {
  issuer: {
    name: 'Clínica Pele',
    document: null,
    registry: null,
    address: null,
  },
  patientName: 'Maria das Dores',
  items: [{ label: 'Cuidados com lesões', frequency: 'diária' }],
  issuedOn: '22/11/2026',
  city: null,
  documentNumber: 'RCT-ABCDEF12',
  signer: { name: 'Enf. Ana Lima', registry: null },
};

async function drawnTexts(doc: PrescriptionDocument): Promise<string[]> {
  const drawn: string[] = [];
  vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation((text: string) => {
    drawn.push(text);
  });
  await renderPrescriptionPdf(doc);
  return drawn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Feature: observações no receituário (#956, ADR-116)', () => {
  it('Dadas observações em dois parágrafos, Quando desenha, Então saem sob o título, entre os itens e a assinatura', async () => {
    const texts = await drawnTexts({
      ...base,
      freeText: 'Manter a pele seca.\n\nTrocar a bolsa às 8h.',
    });

    const title = texts.indexOf('Observações');
    expect(title).toBeGreaterThan(texts.indexOf('Frequência: diária'));
    expect(texts.slice(title + 1, title + 3)).toEqual([
      'Manter a pele seca.',
      'Trocar a bolsa às 8h.',
    ]);
    expect(texts.indexOf('Enf. Ana Lima')).toBeGreaterThan(title + 2);
  });

  it.each([[undefined], [null], ['']])(
    'Dadas observações %j, Quando desenha, Então a seção não sai',
    async (freeText) => {
      const texts = await drawnTexts({ ...base, freeText });

      expect(texts).not.toContain('Observações');
    },
  );
});
