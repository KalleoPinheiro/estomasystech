import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpCode,
  totpStep,
  verifyTotp,
} from '@/domain/auth/totp';

// Chave do Apêndice B do RFC 6238 para SHA-1: "12345678901234567890" em ASCII.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('Feature: TOTP do RFC 6238 (B2, ADR-007)', () => {
  it('Dado os vetores do RFC 6238, Quando calcular o código, Então bate com os 6 últimos dígitos do apêndice B', () => {
    const vectors: Array<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [seconds, eightDigits] of vectors) {
      expect(totpCode(RFC_SECRET, totpStep(seconds * 1000))).toBe(
        eightDigits.slice(-6),
      );
    }
  });

  it('Dado um código, Quando verificar na janela de ±1 passo, Então aceita -1, 0 e +1 e recusa ±2', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    for (const delta of [-1, 0, 1]) {
      expect(
        verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + delta), now),
      ).toBe(step + delta);
    }
    for (const delta of [-2, 2]) {
      expect(
        verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + delta), now),
      ).toBeNull();
    }
  });

  it('Dado passo já usado, Quando verificar o mesmo código, Então não aceita passo já usado nem anterior', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const code = totpCode(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(
      verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now, step - 1),
    ).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now, step - 1)).toBe(step);
  });

  it('Dado chave e e-mail, Quando montar o link otpauth, Então tem a forma literal do Landing com o e-mail codificado', () => {
    expect(otpauthUri('JBSWY3DPEHPK3PXP', 'dono+ops@vitta.test')).toBe(
      'otpauth://totp/VittaFlow:dono%2Bops%40vitta.test?secret=JBSWY3DPEHPK3PXP&issuer=VittaFlow&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('Dado chave gerada, Quando codificar e decodificar, Então tem 160 bits em 32 caracteres base32', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(() => base32Decode('1NVALID')).toThrow();
  });
});
