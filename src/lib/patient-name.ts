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
