import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  type PlanProposalTerms,
  PROPOSAL_DISCLAIMER,
} from '@/domain/billing/plan-proposal';
import { formatCurrency } from '@/lib/format';
import {
  drawHeader,
  type Fonts,
  PageWriter,
  type PrescriptionDocument,
} from './prescription-pdf';

/**
 * Proposta do plano de acompanhamento em PDF (#964). Só desenha: quem monta o
 * documento (papel, escopo da empresa, auditoria) é
 * `src/lib/server/plan-proposal.ts`. Usa o mesmo timbre do receituário.
 */

export interface PlanProposalDocument {
  issuer: PrescriptionDocument['issuer'];
  city: string | null;
  patientName: string;
  procedureName: string;
  /** Preço da consulta avulsa, do catálogo de procedimentos. */
  singlePriceCents: number;
  terms: PlanProposalTerms;
  /** Já formatadas (dd/mm/aaaa). */
  issuedOn: string;
  validUntil: string;
  reassessmentOn: string | null;
  /** Próxima consulta marcada, já formatada; sem ela, a linha não sai. */
  nextAppointment: string | null;
  signer: { name: string; registry: string | null };
}

const BODY = { size: 11 } as const;
const LABEL = { size: 11, bold: true } as const;

function section(writer: PageWriter, label: string, value: string | null) {
  if (!value) return;
  writer.ensureSpace(32);
  writer.text(label, LABEL);
  for (const paragraph of value.split(/\n+/)) {
    writer.text(paragraph, BODY);
  }
  writer.gap(8);
}

function drawPrices(writer: PageWriter, doc: PlanProposalDocument) {
  const { terms } = doc;
  writer.ensureSpace(60);
  writer.text('Investimento', LABEL);
  writer.text(
    `Consulta avulsa (${doc.procedureName}): ${formatCurrency(doc.singlePriceCents)}`,
    BODY,
  );
  writer.text(
    `Plano de ${terms.totalSessions} consultas: ${formatCurrency(terms.priceCents)} (${formatCurrency(terms.pricePerSessionCents)} por consulta)`,
    BODY,
  );
  writer.gap(8);
}

function drawSignature(writer: PageWriter, doc: PlanProposalDocument) {
  const dateLine = doc.city ? `${doc.city}, ${doc.issuedOn}` : doc.issuedOn;
  writer.ensureSpace(110);
  writer.gap(10);
  writer.text(dateLine, BODY);
  writer.gap(40);
  writer.rule(220);
  writer.text(doc.signer.name, { size: 11, align: 'center' });
  writer.text(doc.signer.registry ?? '', { size: 9, align: 'center' });
}

export async function renderPlanProposalPdf(
  doc: PlanProposalDocument,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  // Metadado sem dado do paciente.
  pdf.setTitle('Proposta de plano de acompanhamento');
  pdf.setProducer('estomasystech');
  pdf.setCreator('estomasystech');
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const writer = new PageWriter(pdf, fonts);
  const { terms } = doc;

  drawHeader(writer, doc.issuer);
  writer.text('PROPOSTA DE PLANO DE ACOMPANHAMENTO', {
    size: 13,
    bold: true,
    align: 'center',
  });
  writer.gap(14);
  writer.text(`Paciente: ${doc.patientName}`, BODY);
  writer.gap(10);
  section(writer, 'Objetivo do acompanhamento', terms.objective);
  section(writer, 'Frequência', terms.frequency);
  section(writer, 'Duração estimada', terms.duration);
  section(writer, 'Modalidade', terms.modality);
  section(writer, 'Reavaliação', doc.reassessmentOn);
  section(writer, 'Terapias indicadas', terms.therapies);
  drawPrices(writer, doc);
  section(writer, 'Materiais', terms.materials);
  section(writer, 'Formas de pagamento', terms.payment);
  section(writer, 'Próxima consulta', doc.nextAppointment);
  section(writer, 'Contato para intercorrências', terms.emergencyContact);
  section(writer, 'Validade', `Proposta válida até ${doc.validUntil}.`);
  section(writer, 'Importante', PROPOSAL_DISCLAIMER);
  drawSignature(writer, doc);
  writer.footnote(`Proposta emitida em ${doc.issuedOn}.`);

  return pdf.save();
}
