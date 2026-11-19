import {
  appTimeZone,
  startOfZonedMonth,
  zonedMonthKey,
} from '../shared/time-zone';

/** O que o e-mail pode dizer de um paciente indicado (POR-RN-11, sem dado clínico). */
export interface PartnerReportLine {
  fullName: string;
  /** Consulta realizada com fim nos últimos 24 meses. */
  attended: boolean;
}

export interface PartnerMonthlyReportContent {
  subject: string;
  text: string;
}

export interface PartnerMonthlyReportInput {
  /** Primeiro nome, na saudação. */
  firstName: string;
  clinicName: string;
  /** Mês anterior já fechado, no fuso da aplicação (EQP-RN-10). */
  monthLabel: string;
  patients: readonly PartnerReportLine[];
}

const ATTENDED = 'consulta realizada nos últimos 24 meses';
const NOT_ATTENDED = 'sem consulta realizada nos últimos 24 meses';

/** Rótulo do mês de `date` no fuso da aplicação, em português. */
export function monthLabelOf(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: appTimeZone(),
  });
}

/** Rótulo do mês anterior já fechado. Janeiro cita dezembro do ano anterior. */
export function closedMonthLabelOf(date: Date): string {
  const previous = zonedMonthKey(date, -1);
  const year = Number(previous.slice(0, 4));
  const month = Number(previous.slice(5, 7));
  return monthLabelOf(startOfZonedMonth(year, month));
}

/**
 * Texto do relatório mensal. Só entra o que o parceiro já vê sem
 * consentimento clínico: nome do paciente e se houve consulta realizada
 * na janela de 24 meses do portal (POR-RN-11). Sem procedimento, data,
 * condição, avaliação, contato ou documento.
 */
export function partnerMonthlyReportContent(
  input: PartnerMonthlyReportInput,
): PartnerMonthlyReportContent {
  const lines = [...input.patients]
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'))
    .map(
      (patient) =>
        `- ${patient.fullName}: ${patient.attended ? ATTENDED : NOT_ATTENDED}`,
    );
  return {
    subject: `Relatório mensal de indicações — ${input.clinicName}`,
    text: [
      `Olá, ${input.firstName}! Este é o relatório da ${input.clinicName}, referente a ${input.monthLabel}.`,
      'Pacientes que você indicou:',
      ...lines,
      'Este e-mail não inclui evolução clínica. Ela só aparece no portal, com a autorização do paciente.',
    ].join('\n'),
  };
}
