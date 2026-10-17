/** Partículas de nome que não entram nas iniciais ("Maria da Silva" → "M.S."). */
const NAME_PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/**
 * Iniciais para identificar o paciente em superfícies de terceiros (Google
 * Agenda, #217): primeira e última letra significativa do nome, sem partículas.
 * Nome de uma palavra só dá uma inicial; nome vazio dá `null`.
 */
export function patientInitials(fullName: string): string | null {
  const words = fullName
    .normalize('NFC')
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const significant = words.filter(
    (word) => !NAME_PARTICLES.has(word.toLowerCase()),
  );
  const picked = significant.length > 0 ? significant : words;
  if (picked.length === 0) {
    return null;
  }
  const letters = [picked[0], picked.length > 1 ? picked.at(-1) : undefined]
    .filter((word): word is string => word !== undefined)
    .map((word) => `${Array.from(word)[0]?.toUpperCase() ?? ''}.`);
  return letters.join('');
}
