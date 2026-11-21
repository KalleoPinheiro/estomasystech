import { ValidationError } from '../shared/errors';

/** Limite de linhas por importação: a lista de uma clínica tem dezenas, não milhares. */
export const CLINIC_DIAGNOSIS_CSV_MAX_ROWS = 1000;

export interface ClinicDiagnosisCsvRow {
  /** Linha do arquivo (1 = cabeçalho), para a clínica achar o erro na planilha. */
  line: number;
  code: string | null;
  label: string;
  domain: string | null;
  class: string | null;
  edition: string | null;
  definition: string | null;
}

type Field = Exclude<keyof ClinicDiagnosisCsvRow, 'line'>;

/** Nome da coluna, sem acento nem caixa → campo. Só `titulo` é obrigatória. */
const HEADERS: Record<string, Field> = {
  codigo: 'code',
  titulo: 'label',
  diagnostico: 'label',
  dominio: 'domain',
  classe: 'class',
  edicao: 'edition',
  definicao: 'definition',
};

const normalizeHeader = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

interface CsvState {
  records: string[][];
  record: string[];
  field: string;
  quoted: boolean;
}

/** Dentro de aspas: `""` vira aspas, `"` fecha, o resto (separador e quebra inclusive) é texto. */
function readQuoted(
  state: CsvState,
  char: string,
  next: string | undefined,
): number {
  if (char === '"' && next === '"') {
    state.field += '"';
    return 2;
  }
  if (char === '"') {
    state.quoted = false;
  } else {
    state.field += char;
  }
  return 1;
}

function readPlain(state: CsvState, char: string, separator: string): void {
  if (char === '"') {
    state.quoted = true;
  } else if (char === separator) {
    state.record.push(state.field);
    state.field = '';
  } else if (char === '\n') {
    state.records.push([...state.record, state.field]);
    state.record = [];
    state.field = '';
  } else if (char !== '\r') {
    state.field += char;
  }
}

/** Separa os registros CSV (RFC 4180): aspas duplas escapam o separador e a quebra de linha. */
function splitRecords(text: string, separator: string): string[][] {
  const state: CsvState = { records: [], record: [], field: '', quoted: false };
  let i = 0;
  while (i < text.length) {
    const char = text[i] as string;
    if (state.quoted) {
      i += readQuoted(state, char, text[i + 1]);
    } else {
      readPlain(state, char, separator);
      i++;
    }
  }
  state.records.push([...state.record, state.field]);
  return state.records;
}

/** Excel em português salva com `;`; outras ferramentas, com `,`. O cabeçalho decide. */
function detectSeparator(text: string): string {
  const newline = text.indexOf('\n');
  const header = newline === -1 ? text : text.slice(0, newline);
  return header.includes(';') ? ';' : ',';
}

function mapHeader(header: string[]): Map<number, Field> {
  const columns = new Map<number, Field>();
  header.forEach((name, index) => {
    const field = HEADERS[normalizeHeader(name)];
    if (field && ![...columns.values()].includes(field)) {
      columns.set(index, field);
    }
  });
  if (![...columns.values()].includes('label')) {
    throw new ValidationError(
      'O arquivo precisa de uma coluna "titulo" (e, se quiser, codigo, dominio, classe, edicao e definicao)',
    );
  }
  return columns;
}

function toRow(
  values: string[],
  columns: Map<number, Field>,
  line: number,
): ClinicDiagnosisCsvRow {
  const row: ClinicDiagnosisCsvRow = {
    line,
    code: null,
    label: '',
    domain: null,
    class: null,
    edition: null,
    definition: null,
  };
  for (const [index, field] of columns) {
    const value = values[index]?.trim() ?? '';
    if (field === 'label') {
      row.label = value;
    } else {
      row[field] = value.length > 0 ? value : null;
    }
  }
  return row;
}

const isBlank = (values: string[]): boolean =>
  values.every((value) => value.trim().length === 0);

/**
 * Lê o CSV que a clínica exporta da planilha dela (#954). Não valida cada diagnóstico: isso é
 * da entidade, linha a linha, para que um erro não derrube o arquivo inteiro.
 */
export function parseClinicDiagnosisCsv(text: string): ClinicDiagnosisCsvRow[] {
  const clean = text.replace(/^\uFEFF/, '');
  // `splitRecords` devolve ao menos um registro (o cabeçalho, mesmo vazio).
  const records = splitRecords(clean, detectSeparator(clean));
  const columns = mapHeader(records[0] as string[]);
  const rows = records
    .slice(1)
    .map((values, index) => ({ values, line: index + 2 }))
    .filter(({ values }) => !isBlank(values))
    .map(({ values, line }) => toRow(values, columns, line));
  if (rows.length === 0) {
    throw new ValidationError('O arquivo não tem nenhum diagnóstico');
  }
  if (rows.length > CLINIC_DIAGNOSIS_CSV_MAX_ROWS) {
    throw new ValidationError(
      `O arquivo pode ter no máximo ${CLINIC_DIAGNOSIS_CSV_MAX_ROWS} diagnósticos`,
    );
  }
  return rows;
}
