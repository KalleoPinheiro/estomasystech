import { PDFDocument, PDFPage } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PROPOSAL_DISCLAIMER,
  planProposalTerms,
} from '@/domain/billing/plan-proposal';
import {
  type PlanProposalDocument,
  renderPlanProposalPdf,
} from '@/lib/documents/plan-proposal-pdf';

const full: PlanProposalDocument = {
  issuer: {
    name: 'Jeiciele Silva',
    document: { label: 'CPF', value: '123.456.789-09' },
    registry: 'COREN-SP 123456',
    address: 'Rua das Flores, 10',
  },
  city: 'Campinas',
  patientName: 'Maria das Dores',
  procedureName: 'Curativo',
  singlePriceCents: 30_000,
  terms: planProposalTerms({
    objective: 'Cicatrizar a lesão',
    frequency: '2x por semana',
    duration: '8 semanas',
    modality: 'Domicílio',
    therapies:
      'Laser: ajuda a cicatrizar\nCobertura com prata: controla infecção',
    materials: 'Inclusos',
    payment: 'Pix',
    emergencyContact: '(19) 99999-0000',
    totalSessions: 4,
    priceCents: 100_000,
  }),
  issuedOn: '24/11/2026',
  validUntil: '24/12/2026',
  reassessmentOn: '20/12/2026',
  nextAppointment: '01/12/2026 09:00',
  signer: { name: 'Jeiciele Silva', registry: 'COREN-SP 123456' },
};

const drawnTexts = async (doc: PlanProposalDocument) => {
  const drawn: string[] = [];
  const spy = vi
    .spyOn(PDFPage.prototype, 'drawText')
    .mockImplementation((text: string) => {
      drawn.push(text);
    });
  try {
    await renderPlanProposalPdf(doc);
  } finally {
    spy.mockRestore();
  }
  return drawn.join('\n');
};

afterEach(() => vi.restoreAllMocks());

describe('Feature: desenho da proposta do plano em PDF (#964)', () => {
  it('gera um PDF A4 sem dado do paciente no título', async () => {
    const pdf = await PDFDocument.load(await renderPlanProposalPdf(full), {
      updateMetadata: false,
    });
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getPage(0).getSize().width).toBeCloseTo(595.28);
    expect(pdf.getTitle()).toBe('Proposta de plano de acompanhamento');
  });

  it('traz preços, validade, aviso e todos os campos preenchidos', async () => {
    const text = await drawnTexts(full);
    for (const expected of [
      'PROPOSTA DE PLANO DE ACOMPANHAMENTO',
      'Paciente: Maria das Dores',
      'Cicatrizar a lesão',
      '2x por semana',
      '8 semanas',
      'Domicílio',
      '20/12/2026',
      'Laser: ajuda a cicatrizar',
      'Cobertura com prata: controla infecção',
      'Consulta avulsa (Curativo): R$',
      'Plano de 4 consultas: R$',
      'por consulta)',
      'Inclusos',
      'Pix',
      '01/12/2026 09:00',
      '(19) 99999-0000',
      'Proposta válida até 24/12/2026.',
      'Campinas, 24/11/2026',
      'COREN-SP 123456',
      'Proposta emitida em 24/11/2026.',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text.replace(/\n/g, ' ')).toContain(PROPOSAL_DISCLAIMER);
  });

  it('campo vazio não sai, mas validade e aviso saem sempre', async () => {
    const text = await drawnTexts({
      ...full,
      city: null,
      reassessmentOn: null,
      nextAppointment: null,
      signer: { name: 'Resp. Técnica', registry: null },
      terms: planProposalTerms({
        objective: 'Cicatrizar',
        totalSessions: 2,
        priceCents: 50_000,
      }),
    });
    expect(text).not.toContain('Frequência');
    expect(text).not.toContain('Reavaliação');
    expect(text).not.toContain('Próxima consulta');
    expect(text).toContain('Validade');
    expect(text).toContain('Importante');
    expect(text).toContain('\n24/11/2026\n');
  });
});
