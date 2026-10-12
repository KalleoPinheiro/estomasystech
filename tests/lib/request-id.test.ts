import { describe, expect, it } from 'vitest';
import {
  isValidRequestId,
  resolveRequestId,
} from '@/lib/observability/request-id';

describe('Request-id (#212, OBS-04)', () => {
  it('Dado id de entrada bem formado, Quando resolve, Então mantém o mesmo', () => {
    expect(resolveRequestId('caddy-1234abcd')).toBe('caddy-1234abcd');
  });

  it.each([
    ['ausente', null],
    ['curto demais', 'abc'],
    ['com espaço (injeção de log)', 'abc def ghi'],
    ['com quebra de linha', 'abcdefgh\n{"level":"error"}'],
    ['longo demais', 'a'.repeat(129)],
  ])('Dado id %s, Quando resolve, Então gera um UUID novo', (_caso, value) => {
    const id = resolveRequestId(value);
    expect(id).not.toBe(value);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(isValidRequestId(id)).toBe(true);
  });

  it('Dado valor que não é texto, Quando valida, Então recusa', () => {
    expect(isValidRequestId(undefined)).toBe(false);
  });
});
