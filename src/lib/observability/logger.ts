import { withRequestId } from './request-context';

/**
 * Único ponto que escreve no stdout/stderr em `src/` (#202, #212): uma linha
 * JSON por evento, com `time`, `level`, `msg`, o `requestId` da requisição
 * corrente (quando há) e campos extras. `tests/lib/log-error-architecture`
 * proíbe `console.*` fora deste arquivo.
 *
 * Os campos não devem levar dado pessoal: use ids. Erro passa por `logError`
 * (`src/lib/log-error.ts`), que remove query, parâmetros e PII da mensagem.
 */
export type LogLevel = 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

export interface LogEntry extends LogFields {
  time: string;
  level: LogLevel;
  msg: string;
  requestId?: string;
}

function write(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === 'error') {
    console.error(line);
  } else if (entry.level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

/**
 * Monta a entrada e a entrega a `sink` junto com o id da requisição. `sink`
 * existe para o `logError` mandar a mesma entrada ao GlitchTip.
 */
export function emit(
  level: LogLevel,
  msg: string,
  fields: LogFields = {},
  sink?: (entry: LogEntry) => void,
): void {
  const time = new Date().toISOString();
  withRequestId((requestId) => {
    const entry: LogEntry = {
      time,
      level,
      msg,
      ...(requestId ? { requestId } : {}),
      ...fields,
    };
    write(entry);
    sink?.(entry);
  });
}

export const logger = {
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
};
