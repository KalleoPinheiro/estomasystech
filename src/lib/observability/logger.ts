import { redactFields, scrubText } from '@/lib/redact';
import { withRequestId } from './request-context';

/**
 * Único ponto que escreve no stdout/stderr em `src/` (#202, #212): uma linha
 * JSON por evento, com `time`, `level`, `msg`, o `requestId` da requisição
 * corrente (quando há) e campos extras. `tests/lib/log-error-architecture`
 * proíbe `console.*` fora deste arquivo.
 *
 * Redação central (#381, ADR-059): `msg` e campos passam por `scrubText` e
 * `redactFields` antes de qualquer saída — CPF, e-mail, telefone, nome de
 * pessoa, conteúdo clínico, token e senha nunca chegam ao stdout nem ao
 * GlitchTip, mesmo que o chamador esqueça. Use ids nos campos de qualquer
 * jeito. Erro passa por `logError` (`src/lib/log-error.ts`), que remove query,
 * parâmetros e PII da mensagem.
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
    // Campo não sobrescreve `time`, `level` nem `msg`; a ordem das chaves
    // (metadados primeiro) é a que o parser do E2E (`invite-log`) espera.
    const { time: _t, level: _l, msg: _m, ...extra } = redactFields(fields);
    const entry: LogEntry = {
      time,
      level,
      msg: scrubText(msg),
      ...(requestId ? { requestId } : {}),
      ...extra,
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
