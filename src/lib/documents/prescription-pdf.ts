import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import { providerDocument } from '@/domain/clinic/clinic';
import type {
  PrescriptionContent,
  PrescriptionItemContent,
} from '@/domain/clinical/nursing-prescription';
import type { ClinicInfoDto } from '@/lib/dto';

/**
 * Receituário de enfermagem em PDF de verdade (#956), gerado no servidor sem
 * depender do "Salvar como PDF" do navegador. Este módulo só desenha: recebe o
 * documento já montado (`PrescriptionDocument`) e devolve os bytes. Quem decide
 * o que entra (escopo da empresa, R4, emissão auditada e congelada) é
 * `src/lib/server/prescription.ts`.
 *
 * Fonte padrão do PDF (Helvetica, WinAnsi): cobre o português inteiro. Caractere
 * fora dela (emoji, símbolo raro) vira `?` em vez de derrubar a geração.
 */

export type PrescriptionItem = PrescriptionItemContent;

/** Conteúdo congelado na emissão (ADR-116), mais número e data impressos. */
export interface PrescriptionDocument
  extends Omit<PrescriptionContent, 'freeText'> {
  /** Observações da prescritora; sem elas, a seção não sai. */
  freeText?: string | null;
  /** Data da emissão persistida (ADR-082), já formatada (dd/mm/aaaa). */
  issuedOn: string;
  documentNumber: string;
}

/**
 * Timbre de quem emite: nome, CNPJ da clínica ou CPF da autônoma e, só na
 * autônoma, o COREN dela (#977), como no cabeçalho dos documentos impressos.
 */
export function prescriptionIssuer(
  clinic: ClinicInfoDto,
): PrescriptionDocument['issuer'] {
  return {
    name: clinic.name,
    document: providerDocument(clinic),
    registry: clinic.kind === 'individual' ? clinic.professionalRegistry : null,
    address: clinic.address,
  };
}

const PAGE = { width: 595.28, height: 841.89 } as const;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const INK = rgb(0, 0, 0);
/** Espaços fixos do bloco de assinatura: antes da data, para assinar e da linha. */
const SIGNATURE_GAPS = 18 + 44 + 6;

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface TextStyle {
  size: number;
  bold?: boolean;
  align?: 'left' | 'center';
  indent?: number;
}

/** Troca o que a fonte padrão não codifica por `?` e junta espaços e quebras. */
export function toPrintable(font: PDFFont, text: string): string {
  let out = '';
  for (const char of text.normalize('NFC').replace(/\s+/g, ' ').trim()) {
    out += canEncode(font, char) ? char : '?';
  }
  return out;
}

function canEncode(font: PDFFont, char: string): boolean {
  try {
    font.encodeText(char);
    return true;
  } catch {
    return false;
  }
}

/** Quebra por palavra; palavra maior que a linha é cortada por caractere. */
export function wrapText(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const fits = (value: string) =>
    font.widthOfTextAtSize(value, size) <= maxWidth;
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    while (!fits(current)) {
      const cut = longestFittingPrefix(current, fits);
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function longestFittingPrefix(
  word: string,
  fits: (value: string) => boolean,
): number {
  let cut = 1;
  while (cut < word.length && fits(word.slice(0, cut + 1))) cut += 1;
  return cut;
}

/** Cursor de escrita de cima para baixo, com página nova quando o espaço acaba. */
class PageWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: Fonts,
  ) {
    this.page = this.addPage();
    this.y = PAGE.height - MARGIN;
  }

  private addPage(): PDFPage {
    return this.pdf.addPage([PAGE.width, PAGE.height]);
  }

  ensureSpace(height: number): void {
    if (this.y - height >= MARGIN) return;
    this.page = this.addPage();
    this.y = PAGE.height - MARGIN;
  }

  private layout(value: string, style: TextStyle) {
    const font = style.bold ? this.fonts.bold : this.fonts.regular;
    const indent = style.indent ?? 0;
    const lineHeight = style.size * 1.4;
    const lines = wrapText(
      font,
      toPrintable(font, value),
      style.size,
      CONTENT_WIDTH - indent,
    );
    return { font, indent, lineHeight, lines };
  }

  /** Altura que o texto ocupa depois de quebrado em linhas. */
  measure(value: string, style: TextStyle): number {
    const { lineHeight, lines } = this.layout(value, style);
    return lines.length * lineHeight;
  }

  text(value: string, style: TextStyle): void {
    const { font, indent, lineHeight, lines } = this.layout(value, style);
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.y -= lineHeight;
      const width = font.widthOfTextAtSize(line, style.size);
      const x =
        style.align === 'center' ? (PAGE.width - width) / 2 : MARGIN + indent;
      this.page.drawText(line, {
        x,
        y: this.y,
        size: style.size,
        font,
        color: INK,
      });
    }
  }

  gap(height: number): void {
    this.y -= height;
  }

  rule(width = CONTENT_WIDTH): void {
    this.y -= 6;
    const start = (PAGE.width - width) / 2;
    this.page.drawLine({
      start: { x: start, y: this.y },
      end: { x: start + width, y: this.y },
      thickness: 0.8,
      color: INK,
    });
  }

  footnote(value: string): void {
    const font = this.fonts.regular;
    const printable = toPrintable(font, value);
    this.page.drawText(printable, {
      x: MARGIN,
      y: MARGIN / 2,
      size: 8,
      font,
      color: INK,
    });
  }
}

function drawHeader(
  writer: PageWriter,
  issuer: PrescriptionDocument['issuer'],
) {
  writer.text(issuer.name, { size: 14, bold: true, align: 'center' });
  const lines = [
    issuer.document
      ? `${issuer.document.label}: ${issuer.document.value}`
      : null,
    issuer.registry,
    issuer.address,
  ];
  for (const line of lines) {
    if (line) writer.text(line, { size: 10, align: 'center' });
  }
  writer.rule();
  writer.gap(18);
}

function drawItems(writer: PageWriter, items: PrescriptionItem[]) {
  items.forEach((item, index) => {
    writer.ensureSpace(40);
    writer.text(`${index + 1}. ${item.label}`, { size: 11, bold: true });
    writer.text(`Frequência: ${item.frequency}`, { size: 11, indent: 14 });
    writer.gap(6);
  });
}

/** Observações da prescritora, além das intervenções do plano (ADR-116). */
function drawFreeText(writer: PageWriter, freeText?: string | null) {
  if (!freeText) return;
  writer.gap(4);
  writer.text('Observações', { size: 11, bold: true });
  for (const paragraph of freeText.split(/\n+/)) {
    writer.text(paragraph, { size: 11 });
  }
  writer.gap(6);
}

const DATE_STYLE: TextStyle = { size: 11 };
const SIGNER_STYLE: TextStyle = { size: 11, align: 'center' };
const REGISTRY_STYLE: TextStyle = { size: 9, align: 'center' };

/** Data, linha, nome e registro ficam juntos: a reserva mede as linhas quebradas. */
function drawSignature(writer: PageWriter, doc: PrescriptionDocument) {
  const dateLine = doc.city ? `${doc.city}, ${doc.issuedOn}` : doc.issuedOn;
  const registry = doc.signer.registry ?? '';
  writer.ensureSpace(
    SIGNATURE_GAPS +
      writer.measure(dateLine, DATE_STYLE) +
      writer.measure(doc.signer.name, SIGNER_STYLE) +
      writer.measure(registry, REGISTRY_STYLE),
  );
  writer.gap(18);
  writer.text(dateLine, DATE_STYLE);
  writer.gap(44);
  writer.rule(220);
  writer.text(doc.signer.name, SIGNER_STYLE);
  writer.text(registry, REGISTRY_STYLE);
}

export async function renderPrescriptionPdf(
  doc: PrescriptionDocument,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  // Metadado sem dado do paciente: o nome do arquivo e o título não o expõem.
  pdf.setTitle(`Receituário de enfermagem ${doc.documentNumber}`);
  pdf.setProducer('estomasystech');
  pdf.setCreator('estomasystech');
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const writer = new PageWriter(pdf, fonts);

  drawHeader(writer, doc.issuer);
  writer.text('RECEITUÁRIO DE ENFERMAGEM', {
    size: 13,
    bold: true,
    align: 'center',
  });
  writer.gap(14);
  writer.text(`Paciente: ${doc.patientName}`, { size: 11 });
  writer.gap(10);
  writer.text('Prescrição de enfermagem', { size: 11, bold: true });
  writer.gap(4);
  drawItems(writer, doc.items);
  drawFreeText(writer, doc.freeText);
  drawSignature(writer, doc);
  writer.footnote(
    `Documento nº ${doc.documentNumber}, emitido em ${doc.issuedOn}.`,
  );

  return pdf.save();
}
