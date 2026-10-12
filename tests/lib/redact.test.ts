import { describe, expect, it } from 'vitest';
import { maskEmail, maskPhone, scrubText } from '@/lib/redact';

describe('Feature: mascaramento de contato para log (CWE-532)', () => {
  it.each([
    ['fulano@x.com', 'fu***@x.com'],
    ['ab@x.com', 'a***@x.com'],
    ['a@x.com', '***@x.com'],
    ['sem-arroba', '***'],
    ['@x.com', '***'],
  ])('Dado e-mail %s, Quando mascarar, Então vira %s', (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });

  it.each([
    ['+5511999997777', '+55******7777'],
    ['(11) 99999-7777', '******7777'],
    ['11999997777', '******7777'],
    ['+55 1234', '******'],
    ['', '******'],
  ])('Dado telefone "%s", Quando mascarar, Então vira %s', (phone, masked) => {
    expect(maskPhone(phone)).toBe(masked);
  });
});

describe('Feature: limpeza de texto livre que sai do processo (#212, OBS-06)', () => {
  it.each([
    [
      'e-mail',
      'Resend 422: fulano.silva+x@clinica.com.br inválido',
      'Resend 422: [e-mail] inválido',
    ],
    ['CPF', 'CPF 123.456.789-09 já existe', 'CPF [número] já existe'],
    ['CNPJ', 'CNPJ 12.345.678/0001-90', 'CNPJ [número]'],
    ['telefone', 'para +55 (11) 99999-7777 falhou', 'para [número] falhou'],
    ['data', 'nascimento 1980-04-03 inválido', 'nascimento [número] inválido'],
  ])(
    'Dado %s, Quando limpa, Então troca por marcador',
    (_caso, input, expected) => {
      expect(scrubText(input)).toBe(expected);
    },
  );

  it.each([
    ['status HTTP', 'Resend API 500: erro'],
    ['UUID', 'conta 12345678-90ab-4def-8123-4567890abcde'],
    ['contagem curta', '3 de 10 lembretes'],
  ])('Dado %s, Quando limpa, Então mantém', (_caso, input) => {
    expect(scrubText(input)).toBe(input);
  });
});
