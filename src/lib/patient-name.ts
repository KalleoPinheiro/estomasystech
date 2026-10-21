import { formatDate } from '@/lib/format';

/** Partículas de nome em português: não viram inicial. */
const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * Nome do paciente em listas e totais (CONTEXT.md, 2026-10-21): primeiro e último
 * nome inteiros e as iniciais dos do meio (`Mateus Paulo Costa Silva` vira
 * `Mateus P. C. Silva`). Nunca só iniciais. Onde o nome identifica o paciente
 * (prontuário, próximo atendimento, triagem, termos) use o nome completo.
 */
export function abbreviatePatientName(
  fullName: string | null | undefined,
): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.join(' ');
  const first = words[0] as string;
  const last = words[words.length - 1] as string;
  const initials = words
    .slice(1, -1)
    .filter((word) => !PARTICLES.has(word.toLowerCase()))
    .map((word) => `${word.charAt(0).toUpperCase()}.`);
  return [first, ...initials, last].join(' ');
}

interface PatientRow {
  patientId: string;
  patientName?: string | null;
  /** ISO; vem nas listas de consultas, faturas e retornos. */
  patientBirthDate?: string | null;
}

const sameAbbreviated = (a: PatientRow) =>
  abbreviatePatientName(a.patientName).toLowerCase();

/**
 * Pacientes distintos cujo nome abreviado é igual na mesma lista (homônimos).
 * Dois identificadores (CONTEXT.md, 2026-10-21): quem colide mostra também a
 * data de nascimento.
 */
export function homonymPatientIds(rows: readonly PatientRow[]): Set<string> {
  const idsByName = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = sameAbbreviated(row);
    const ids = idsByName.get(key) ?? new Set<string>();
    ids.add(row.patientId);
    idsByName.set(key, ids);
  }
  const homonyms = new Set<string>();
  for (const ids of idsByName.values()) {
    if (ids.size > 1) for (const id of ids) homonyms.add(id);
  }
  return homonyms;
}

/** Nome da linha numa lista: abreviado e, se colidir com outro paciente, com o nascimento. */
export function listPatientName(
  row: PatientRow,
  homonyms: ReadonlySet<string>,
): string {
  const name = abbreviatePatientName(row.patientName);
  if (!homonyms.has(row.patientId) || !row.patientBirthDate) return name;
  return `${name} · nasc. ${formatDate(row.patientBirthDate)}`;
}
