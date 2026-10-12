/**
 * Correlação de request (#212): o proxy gera (ou aceita do proxy reverso) um
 * id por requisição, repassa ao handler no cabeçalho `x-request-id` e o
 * devolve na resposta. O logger o grava em toda linha emitida durante a
 * requisição.
 *
 * Só aceitamos de fora um id curto e sem espaço: o valor vai para o log e
 * para o GlitchTip, e um cabeçalho arbitrário viraria injeção de log.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function isValidRequestId(value: string | null | undefined): boolean {
  return typeof value === 'string' && VALID_REQUEST_ID.test(value);
}

/** Id recebido, se válido; senão um UUID novo. */
export function resolveRequestId(incoming: string | null | undefined): string {
  return incoming && isValidRequestId(incoming)
    ? incoming
    : crypto.randomUUID();
}
