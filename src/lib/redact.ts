/**
 * Mascaramento de dado pessoal para logs e GlitchTip (CWE-532, LGPD art. 46,
 * #381, ADR-060). `maskEmail`/`maskPhone` dizem *para quem* iria uma mensagem
 * sem gravar o dado inteiro; `scrubText`, `redactValue` e `redactFields` são a
 * barreira central do logger: nada que passa por `emit` sai sem elas.
 */

const HIDDEN = '***';
const HIDDEN_DIGITS = '******';
const VISIBLE_PHONE_TAIL = 4;
const VISIBLE_COUNTRY_CODE = 2;

/** `fulano@x.com` → `fu***@x.com`. Sem `@` válido, nada fica visível. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return HIDDEN;
  const local = email.slice(0, at);
  const visible = Math.min(2, local.length - 1);
  return `${local.slice(0, visible)}${HIDDEN}${email.slice(at)}`;
}

/**
 * `+5511999997777` → `+55******7777`; `(11) 99999-7777` → `******7777`.
 * O miolo tem tamanho fixo para não revelar quantos dígitos o número tem.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= VISIBLE_PHONE_TAIL + VISIBLE_COUNTRY_CODE) {
    return HIDDEN_DIGITS;
  }
  const tail = digits.slice(-VISIBLE_PHONE_TAIL);
  const country = phone.trim().startsWith('+')
    ? `+${digits.slice(0, VISIBLE_COUNTRY_CODE)}`
    : '';
  return `${country}${HIDDEN_DIGITS}${tail}`;
}

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** Sequência de dígitos com separadores comuns de CPF, CNPJ, telefone e data. */
const NUMBER_PATTERN = /(?<![\w-])\+?\d[\d\s()./-]*\d(?![\w-])/g;
const MIN_HIDDEN_DIGITS = 8;
/** URL com query ou fragmento: o resto carrega token (convite, reset, OAuth). */
const URL_WITH_QUERY_PATTERN = /(https?:\/\/[^\s?#"']+)[?#][^\s"']*/g;
const BEARER_PATTERN = /\b(Bearer|Basic)\s+[\w.~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
/** Sequência opaca longa (token, chave, hash); UUID tem hífens nas posições fixas. */
const OPAQUE_PATTERN = /(?<![\w-])[A-Za-z0-9_-]{32,}(?![\w-])/g;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Texto livre que pode sair do processo (mensagem de erro no log e no
 * GlitchTip, #212, #381): troca URL com query, credencial (Bearer, JWT,
 * sequência opaca de 32+ caracteres), e-mail e número longo (CPF, CNPJ,
 * telefone, data) por um marcador. Ids (UUID) e números curtos (status HTTP,
 * contagem) ficam. Nome de pessoa em texto livre não é detectável: por isso o
 * logger redige por *campo* (`redactFields`) e o teste de arquitetura proíbe
 * interpolar nome em mensagem.
 */
export function scrubText(text: string): string {
  return text
    .replace(URL_WITH_QUERY_PATTERN, '$1?[redigido]')
    .replace(BEARER_PATTERN, '$1 [redigido]')
    .replace(JWT_PATTERN, '[redigido]')
    .replace(OPAQUE_PATTERN, (match) =>
      UUID_PATTERN.test(match) ? match : '[redigido]',
    )
    .replace(EMAIL_PATTERN, '[e-mail]')
    .replace(NUMBER_PATTERN, (match) =>
      match.replace(/\D/g, '').length >= MIN_HIDDEN_DIGITS ? '[número]' : match,
    );
}

export const REDACTED = '[redigido]';

/**
 * Campos de log cujo valor nunca sai, qualquer que seja o conteúdo (LGPD
 * art. 46, #381): identificação (CPF, e-mail, telefone, nome de pessoa),
 * conteúdo clínico e segredos. A chave é normalizada (minúscula, sem
 * separador) e casa por fragmento; ids (`patientId`) não casam.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  'cpf',
  'cnpj',
  'email',
  'phone',
  'telefone',
  'celular',
  'whatsapp',
  'nascimento',
  'birth',
  'endereco',
  'address',
  'anamnese',
  'anamnesis',
  'diagnos',
  'prontuario',
  'evolucao',
  'observacao',
  'observation',
  'notes',
  'password',
  'senha',
  'secret',
  'token',
  'authorization',
  'cookie',
  'credential',
  'apikey',
  'hash',
  'dsn',
];
/** `patientName`, `nomeCompleto`, `nome` — mas não `error.name` (classe do erro). */
const PERSON_NAME_KEY =
  /^(?:nome|nomecompleto|nomesocial)$|(?:patient|user|guardian|professional|partner|person|full|first|last|social|display|contact|recipient)name$/;
/** Corpo de mensagem e de requisição: pode levar qualquer dado do paciente. */
const CONTENT_KEYS = new Set(['body', 'payload', 'text', 'content', 'html']);
/** Campos que são metadado do evento ou saída já sanitizada. */
const PASSTHROUGH_KEYS = new Set(['requestid', 'stack', 'time', 'level']);

const MAX_DEPTH = 5;
const MAX_ITEMS = 50;
/** Link de definição de senha impresso só fora de produção (dev e E2E). */
const DEV_AUTH_LINK = /^https?:\/\/\S+\/definir-senha\?token=[\w-]+$/;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    CONTENT_KEYS.has(normalized) ||
    PERSON_NAME_KEY.test(normalized) ||
    SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}

function isDevAuthLink(key: string, value: unknown): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    key === 'link' &&
    typeof value === 'string' &&
    DEV_AUTH_LINK.test(value)
  );
}

/**
 * Valor pronto para ir ao log: campo sensível vira `[redigido]`, texto passa
 * por `scrubText`, objeto e lista são percorridos (profundidade e tamanho
 * limitados, ciclo cortado) e binário nunca é impresso.
 */
export function redactValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object' || value === null) {
    return typeof value === 'function' || typeof value === 'symbol'
      ? undefined
      : value;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return '[binário]';
  }
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[profundo]';
  seen.add(value);
  if (value instanceof Error) {
    return { name: value.name, message: scrubText(value.message) };
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ITEMS)
      .map((item) => redactValue(item, seen, depth + 1));
  }
  return redactFields(value as Record<string, unknown>, seen, depth + 1);
}

/** Campos de log com a regra de `redactValue` aplicada chave a chave. */
export function redactFields(
  fields: Record<string, unknown>,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields).slice(0, MAX_ITEMS)) {
    if (PASSTHROUGH_KEYS.has(normalizeKey(key)) || isDevAuthLink(key, value)) {
      clean[key] = value;
    } else if (isSensitiveKey(key)) {
      clean[key] = value === null || value === undefined ? value : REDACTED;
    } else {
      clean[key] = redactValue(value, seen, depth);
    }
  }
  return clean;
}
