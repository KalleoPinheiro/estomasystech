import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type PrescriptionDocument,
  prescriptionIssuer,
  renderPrescriptionPdf,
  toPrintable,
  wrapText,
} from '@/lib/documents/prescription-pdf';

const base: PrescriptionDocument = {
  issuer: {
    name: 'Jeiciele Silva',
    document: { label: 'CPF', value: '123.456.789-09' },
    registry: 'COREN-SP 123456',
    address: 'Rua das Flores, 10',
  },
  patientName: 'Maria das Dores',
  items: [
    { label: 'Cuidados com lesões', frequency: 'a cada troca de curativo' },
  ],
  issuedOn: '22/11/2026',
  city: 'São Paulo',
  documentNumber: 'RCT-ABCDEF12',
  signer: { name: 'Enf. Ana Lima', registry: 'COREN-SP 123456' },
};

let font: Awaited<ReturnType<PDFDocument['embedFont']>>;

beforeAll(async () => {
  font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
});

describe('Feature: desenho do receituário em PDF (#956)', () => {
  it('Dado o documento completo, Quando renderiza, Então gera um PDF de uma página A4 com título sem dado do paciente', async () => {
    const bytes = await renderPrescriptionPdf(base);
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });

    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize().width).toBeCloseTo(595.28);
    expect(pdf.getTitle()).toBe('Receituário de enfermagem RCT-ABCDEF12');
    expect(pdf.getTitle()).not.toContain(base.patientName);
    expect(pdf.getProducer()).toBe('estomasystech');
  });

  it('Dado muitos itens, Quando renderiza, Então continua em página nova', async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      label: `Intervenção ${i + 1}`,
      frequency: 'diária',
    }));

    const pdf = await PDFDocument.load(
      await renderPrescriptionPdf({ ...base, items }),
    );

    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it('Dado clínica sem documento, registro, endereço, cidade e assinante sem registro, Quando renderiza, Então gera o PDF mesmo assim', async () => {
    const bytes = await renderPrescriptionPdf({
      ...base,
      issuer: {
        name: 'Clínica',
        document: null,
        registry: null,
        address: null,
      },
      city: null,
      signer: { name: 'Resp. Técnica', registry: null },
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('Dado texto com emoji e quebras, Quando prepara para a fonte padrão, Então troca o que não codifica por ? e junta espaços', () => {
    expect(toPrintable(font, '  Curativo\n com  açúcar 🙂 ')).toBe(
      'Curativo com açúcar ?',
    );
  });

  it('Dado texto maior que a linha, Quando quebra, Então separa por palavra e corta palavra longa', () => {
    const lines = wrapText(font, `curto ${'x'.repeat(60)} fim`, 10, 100);

    expect(lines[0]).toBe('curto');
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(100);
    }
    expect(lines.join('')).toBe(`curto${'x'.repeat(60)}fim`);
  });

  it('Dado palavra longa logo no início, Quando quebra, Então corta sem linha vazia antes', () => {
    const lines = wrapText(font, 'y'.repeat(40), 10, 50);

    expect(lines[0]?.length).toBeGreaterThan(0);
    expect(lines.join('')).toBe('y'.repeat(40));
  });

  it('Dado autônoma, Quando monta o timbre, Então leva CPF e COREN; na clínica, CNPJ sem COREN', () => {
    const shared = {
      name: 'Emissora',
      cnpj: '11.222.333/0001-81',
      address: null,
      city: null,
      professionalName: 'Ana',
      professionalRegistry: 'COREN-SP 1',
    };

    expect(
      prescriptionIssuer({ ...shared, kind: 'individual', cpf: '12345678909' }),
    ).toEqual({
      name: 'Emissora',
      document: { label: 'CPF', value: '123.456.789-09' },
      registry: 'COREN-SP 1',
      address: null,
    });
    expect(prescriptionIssuer(shared)).toEqual({
      name: 'Emissora',
      document: { label: 'CNPJ', value: '11.222.333/0001-81' },
      registry: null,
      address: null,
    });
  });

  it('Dado texto vazio, Quando quebra, Então não gera linha', () => {
    expect(wrapText(font, '', 10, 100)).toEqual([]);
  });
});
