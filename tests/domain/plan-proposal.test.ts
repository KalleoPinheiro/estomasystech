import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_DATE_INVALID_MESSAGE,
  PROPOSAL_DISCLAIMER,
  PROPOSAL_MAX_SESSIONS,
  PROPOSAL_OBJECTIVE_REQUIRED_MESSAGE,
  PROPOSAL_PRICE_INVALID_MESSAGE,
  PROPOSAL_SESSIONS_INVALID_MESSAGE,
  PROPOSAL_TEXT_MAX,
  PROPOSAL_TEXT_TOO_LONG_MESSAGE,
  PROPOSAL_VALIDITY_MONTHS,
  planProposalTerms,
  proposalValidUntil,
} from '@/domain/billing/plan-proposal';

const base = {
  objective: 'Cicatrizar a lesão',
  totalSessions: 4,
  priceCents: 100_000,
};

describe('Feature: proposta do plano de acompanhamento (#964)', () => {
  describe('Cenário: validade de 1 mês (decisão do Kalléo)', () => {
    it('vale até o mesmo dia do mês seguinte', () => {
      expect(PROPOSAL_VALIDITY_MONTHS).toBe(1);
      expect(proposalValidUntil('2026-11-24')).toBe('2026-12-24');
      expect(proposalValidUntil('2026-12-15')).toBe('2027-01-15');
    });

    it('dia que não existe no mês seguinte cai no último dia', () => {
      expect(proposalValidUntil('2027-01-31')).toBe('2027-02-28');
      expect(proposalValidUntil('2028-01-30')).toBe('2028-02-29');
      expect(proposalValidUntil('2026-03-31')).toBe('2026-04-30');
      expect(proposalValidUntil('2026-02-28')).toBe('2026-03-28');
    });

    it.each(['2026-02-30', '24/11/2026', '2026-13-01', ''])(
      'recusa data de emissão inválida %s',
      (value) => {
        expect(() => proposalValidUntil(value)).toThrow(
          PROPOSAL_DATE_INVALID_MESSAGE,
        );
      },
    );
  });

  it('o aviso fala de fatores individuais', () => {
    expect(PROPOSAL_DISCLAIMER).toContain('fatores individuais');
  });

  describe('Cenário: termos preenchidos pela equipe', () => {
    it('limpa espaços, troca vazio por null e calcula o preço por consulta', () => {
      const terms = planProposalTerms({
        ...base,
        objective: '  Cicatrizar a lesão  ',
        frequency: ' ',
        payment: 'Pix ou cartão',
        reassessmentOn: ' 2026-12-20 ',
      });
      expect(terms).toEqual({
        objective: 'Cicatrizar a lesão',
        frequency: null,
        duration: null,
        modality: null,
        therapies: null,
        materials: null,
        payment: 'Pix ou cartão',
        emergencyContact: null,
        totalSessions: 4,
        priceCents: 100_000,
        pricePerSessionCents: 25_000,
        reassessmentOn: '2026-12-20',
      });
    });

    it('arredonda o preço por consulta ao centavo', () => {
      expect(
        planProposalTerms({ ...base, totalSessions: 3, priceCents: 10_000 })
          .pricePerSessionCents,
      ).toBe(3333);
      expect(
        planProposalTerms({ ...base, totalSessions: 3, priceCents: 20_000 })
          .pricePerSessionCents,
      ).toBe(6667);
    });

    it('reavaliação vazia vira null', () => {
      expect(
        planProposalTerms({ ...base, reassessmentOn: '' }).reassessmentOn,
      ).toBeNull();
      expect(planProposalTerms(base).reassessmentOn).toBeNull();
    });

    it('exige objetivo', () => {
      expect(() => planProposalTerms({ ...base, objective: '  ' })).toThrow(
        PROPOSAL_OBJECTIVE_REQUIRED_MESSAGE,
      );
      expect(() =>
        planProposalTerms({ totalSessions: 4, priceCents: 0 }),
      ).toThrow(PROPOSAL_OBJECTIVE_REQUIRED_MESSAGE);
    });

    it('aceita de 1 a 100 consultas', () => {
      expect(
        planProposalTerms({ ...base, totalSessions: 1 }).totalSessions,
      ).toBe(1);
      expect(
        planProposalTerms({ ...base, totalSessions: PROPOSAL_MAX_SESSIONS })
          .totalSessions,
      ).toBe(100);
      for (const totalSessions of [0, 101, 2.5]) {
        expect(() => planProposalTerms({ ...base, totalSessions })).toThrow(
          PROPOSAL_SESSIONS_INVALID_MESSAGE,
        );
      }
    });

    it('aceita preço zero e recusa negativo ou fracionado', () => {
      expect(planProposalTerms({ ...base, priceCents: 0 }).priceCents).toBe(0);
      for (const priceCents of [-1, 10.5]) {
        expect(() => planProposalTerms({ ...base, priceCents })).toThrow(
          PROPOSAL_PRICE_INVALID_MESSAGE,
        );
      }
    });

    it('limita cada texto a 1000 caracteres', () => {
      const max = 'a'.repeat(PROPOSAL_TEXT_MAX);
      expect(planProposalTerms({ ...base, materials: max }).materials).toBe(
        max,
      );
      expect(() =>
        planProposalTerms({ ...base, materials: `${max}a` }),
      ).toThrow(PROPOSAL_TEXT_TOO_LONG_MESSAGE);
    });

    it('recusa reavaliação inválida', () => {
      expect(() =>
        planProposalTerms({ ...base, reassessmentOn: '2026-02-30' }),
      ).toThrow(PROPOSAL_DATE_INVALID_MESSAGE);
    });
  });
});
