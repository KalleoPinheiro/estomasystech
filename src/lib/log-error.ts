import { captureError } from '@/lib/observability/error-tracker';
import { emit, type LogFields } from '@/lib/observability/logger';
import { scrubText } from '@/lib/redact';

/**
 * Único ponto de log de erro em `src/` (issue #202, LGPD art. 46 / CWE-532).
 *
 * O Drizzle lança `DrizzleQueryError` com a query e os PARÂMETROS na mensagem
 * (`Failed query: … params: …`) — logar o objeto cru despeja nome, e-mail,
 * anamnese e até `password_hash` no stdout. O driver do Postgres, por sua vez,
 * põe valores em `detail` (`Key (email)=(fulano@x.com) already exists`). Aqui
 * erro de banco vira só metadados: SQLSTATE, tabela, constraint e o stack sem a
 * linha de mensagem. A mensagem dos demais erros perde e-mail e número longo
 * (`scrubText`, #212). A linha sai em JSON pelo logger estruturado e o mesmo
 * erro vai ao GlitchTip quando configurado (`error-tracker.ts`).
 */

export interface SafeErrorLog {
  name: string;
  message?: string;
  code?: string;
  table?: string;
  constraint?: string;
  column?: string;
  stack?: string;
  cause?: SafeErrorLog;
}

const MAX_CAUSE_DEPTH = 3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const stringField = (
  source: Record<string, unknown>,
  key: string,
): string | undefined =>
  typeof source[key] === 'string' ? (source[key] as string) : undefined;

/** `DrizzleQueryError` (sem `entityKind`, então identificado pelo formato) ou erro do driver `pg`. */
function isDatabaseError(error: Error): boolean {
  const record = error as unknown as Record<string, unknown>;
  if ('params' in record && 'query' in record) return true;
  const code = stringField(record, 'code');
  return (
    code !== undefined &&
    /^[0-9A-Z]{5}$/.test(code) &&
    ('severity' in record || 'routine' in record)
  );
}

/** Stack sem a primeira linha (`Nome: mensagem`), que carrega a query/params. */
function framesOnly(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const frames = stack
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '));
  return frames.length > 0 ? frames.join('\n') : undefined;
}

function databaseCode(
  error: Error,
): Pick<SafeErrorLog, 'code' | 'table' | 'constraint' | 'column'> {
  const own = error as unknown as Record<string, unknown>;
  const cause = isRecord(own.cause) ? own.cause : {};
  const pick = (key: string) =>
    stringField(own, key) ?? stringField(cause, key);
  return {
    code: pick('code'),
    table: pick('table'),
    constraint: pick('constraint'),
    column: pick('column'),
  };
}

/** Versão do erro que pode ir para o log. Exportada para teste. */
export function sanitizeError(error: unknown, depth = 0): SafeErrorLog {
  if (!(error instanceof Error)) {
    return { name: typeof error, message: 'valor não-Error lançado' };
  }
  if (isDatabaseError(error)) {
    return {
      name: error.name === 'Error' ? 'DatabaseError' : error.name,
      ...databaseCode(error),
      stack: framesOnly(error.stack),
    };
  }
  const safe: SafeErrorLog = {
    name: error.name,
    message: scrubText(error.message),
    stack: framesOnly(error.stack),
  };
  // Erros de sistema do Node (ECONNREFUSED, ETIMEDOUT…) — sem dado pessoal.
  const code = stringField(error as unknown as Record<string, unknown>, 'code');
  if (code !== undefined) {
    safe.code = code;
  }
  if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    safe.cause = sanitizeError(error.cause, depth + 1);
  }
  return safe;
}

/**
 * Loga um erro inesperado sem dado pessoal. `context` e `fields` não devem
 * conter PII (use ids).
 */
export function logError(
  context: string,
  error: unknown,
  fields: LogFields = {},
): void {
  const safe = sanitizeError(error);
  emit('error', context, { ...fields, error: safe }, (entry) =>
    captureError({ context, error: safe, requestId: entry.requestId }),
  );
}
