import { ValidationError } from '../shared/errors';

/**
 * Proposta do plano de acompanhamento (#964): documento que a clínica entrega
 * ao paciente antes da venda. É gerada na hora e não fica guardada; a emissão
 * vai para a auditoria. Decisões do Kalléo (2026-11-23): validade padrão de 1
 * mês e o aviso de fatores individuais sai sempre.
 */

export const PROPOSAL_VALIDITY_MONTHS = 1;

export const PROPOSAL_DISCLAIMER =
  'O resultado do acompanhamento depende de fatores individuais de cada paciente e não pode ser garantido.';

export const PROPOSAL_TEXT_MAX = 1000;
export const PROPOSAL_MAX_SESSIONS = 100;

export const PROPOSAL_OBJECTIVE_REQUIRED_MESSAGE =
  'Informe o objetivo do acompanhamento';
export const PROPOSAL_SESSIONS_INVALID_MESSAGE = `O plano deve ter de 1 a ${PROPOSAL_MAX_SESSIONS} consultas`;
export const PROPOSAL_PRICE_INVALID_MESSAGE =
  'Preço do plano deve ser inteiro não-negativo em centavos';
export const PROPOSAL_TEXT_TOO_LONG_MESSAGE = `Cada campo da proposta aceita até ${PROPOSAL_TEXT_MAX} caracteres`;
export const PROPOSAL_DATE_INVALID_MESSAGE =
  'Data de reavaliação inválida (use AAAA-MM-DD)';

/** Textos que a equipe escreve; vazio vira `null` e a linha não sai no PDF. */
export const PROPOSAL_TEXT_FIELDS = [
  'objective',
  'frequency',
  'duration',
  'modality',
  'therapies',
  'materials',
  'payment',
  'emergencyContact',
] as const;

export type ProposalTextField = (typeof PROPOSAL_TEXT_FIELDS)[number];

export type ProposalTexts = Record<ProposalTextField, string | null>;

export interface PlanProposalInput extends Partial<ProposalTexts> {
  totalSessions: number;
  priceCents: number;
  /** Data civil `AAAA-MM-DD`, opcional. */
  reassessmentOn?: string | null;
}

export interface PlanProposalTerms extends ProposalTexts {
  objective: string;
  totalSessions: number;
  priceCents: number;
  pricePerSessionCents: number;
  reassessmentOn: string | null;
}

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseCivilDate(value: string): [number, number, number] | null {
  const match = CIVIL_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return real ? [year, month, day] : null;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Último dia de validade: o mesmo dia no mês seguinte; quando ele não existe
 * (31/01), vale o último dia do mês (28 ou 29/02).
 */
export function proposalValidUntil(issuedOn: string): string {
  const parsed = parseCivilDate(issuedOn);
  if (!parsed) {
    throw new ValidationError(PROPOSAL_DATE_INVALID_MESSAGE);
  }
  const [year, month, day] = parsed;
  const targetMonthIndex = month - 1 + PROPOSAL_VALIDITY_MONTHS;
  const lastDay = new Date(Date.UTC(year, targetMonthIndex + 1, 0));
  const target = new Date(
    Date.UTC(year, targetMonthIndex, Math.min(day, lastDay.getUTCDate())),
  );
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length > PROPOSAL_TEXT_MAX) {
    throw new ValidationError(PROPOSAL_TEXT_TOO_LONG_MESSAGE);
  }
  return trimmed.length === 0 ? null : trimmed;
}

function cleanTexts(input: PlanProposalInput): ProposalTexts {
  const texts = {} as ProposalTexts;
  for (const field of PROPOSAL_TEXT_FIELDS) {
    texts[field] = cleanText(input[field]);
  }
  return texts;
}

function assertSessions(totalSessions: number): void {
  if (
    !Number.isInteger(totalSessions) ||
    totalSessions < 1 ||
    totalSessions > PROPOSAL_MAX_SESSIONS
  ) {
    throw new ValidationError(PROPOSAL_SESSIONS_INVALID_MESSAGE);
  }
}

function assertPrice(priceCents: number): void {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new ValidationError(PROPOSAL_PRICE_INVALID_MESSAGE);
  }
}

function cleanReassessment(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return null;
  if (!parseCivilDate(trimmed)) {
    throw new ValidationError(PROPOSAL_DATE_INVALID_MESSAGE);
  }
  return trimmed;
}

/** Valida e normaliza o que a equipe preencheu; o preço por consulta sai daqui. */
export function planProposalTerms(input: PlanProposalInput): PlanProposalTerms {
  const texts = cleanTexts(input);
  if (texts.objective === null) {
    throw new ValidationError(PROPOSAL_OBJECTIVE_REQUIRED_MESSAGE);
  }
  assertSessions(input.totalSessions);
  assertPrice(input.priceCents);
  return {
    ...texts,
    objective: texts.objective,
    totalSessions: input.totalSessions,
    priceCents: input.priceCents,
    pricePerSessionCents: Math.round(input.priceCents / input.totalSessions),
    reassessmentOn: cleanReassessment(input.reassessmentOn),
  };
}
