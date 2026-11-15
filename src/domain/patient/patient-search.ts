/**
 * Busca, ordenação e paginação de pacientes em memória (ADR-096). Com o nome
 * cifrado em repouso, o banco não ordena nem filtra por ele: o repositório lê
 * `id` + nome decifrado da empresa e estas funções puras decidem a página.
 * Os repositórios Drizzle e in-memory usam as mesmas regras.
 */

export interface PatientNameEntry {
  id: string;
  fullName: string;
}

export interface PatientSelection {
  /** Termo de nome digitado; vazio ou ausente não filtra. */
  term?: string;
  /** Ids achados por índice cego (CPF, telefone ou e-mail exatos): entram mesmo sem casar o nome. */
  matchedIds?: ReadonlySet<string>;
  /** Id do último item da página anterior; o cursor não carrega o nome. */
  cursorId?: string | null;
  limit: number;
}

/** Sem acento, sem caixa e com espaços colapsados: "  JOSÉ  da Silva " → "jose da silva". */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Ordem estável da listagem: nome normalizado, depois id. */
export function comparePatientEntries(
  a: PatientNameEntry,
  b: PatientNameEntry,
): number {
  return (
    compareText(
      normalizeSearchText(a.fullName),
      normalizeSearchText(b.fullName),
    ) || compareText(a.id, b.id)
  );
}

/**
 * Itens da página pedida, na ordem da listagem. Cursor que não aponta mais para
 * um item da seleção (paciente removido ou renomeado) devolve página vazia:
 * repetir ou pular itens seria pior do que encerrar a paginação.
 */
export function selectPatientPage<T extends PatientNameEntry>(
  entries: readonly T[],
  selection: PatientSelection,
): T[] {
  const term = normalizeSearchText(selection.term ?? '');
  const matched = selection.matchedIds;
  const visible = entries
    .filter(
      (entry) =>
        term === '' ||
        matched?.has(entry.id) === true ||
        normalizeSearchText(entry.fullName).includes(term),
    )
    .sort(comparePatientEntries);
  let start = 0;
  if (selection.cursorId) {
    const position = visible.findIndex((e) => e.id === selection.cursorId);
    if (position < 0) return [];
    start = position + 1;
  }
  return visible.slice(start, start + selection.limit);
}
