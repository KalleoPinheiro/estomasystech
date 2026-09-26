import { describe, expect, it } from 'vitest';
import { maskEmail, maskPhone } from '@/lib/redact';

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
