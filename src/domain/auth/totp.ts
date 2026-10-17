import { createHmac, randomBytes } from 'node:crypto';

/**
 * TOTP do RFC 6238 (ADR-007, bloco B2): HMAC-SHA-1, 6 dígitos, passo de 30 s,
 * janela de ±1 passo. Implementado sobre `node:crypto`, sem dependência — o
 * mesmo algoritmo de qualquer app autenticador.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
export const TOTP_ISSUER = 'VittaFlow';
const SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error('Chave do autenticador em formato inválido');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Chave nova (160 bits, o tamanho do HMAC-SHA-1) em base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/** Código do passo `step` (RFC 4226 § 5.3, truncamento dinâmico). */
export function totpCode(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secretBase32))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Passo que casa com `code` dentro da janela, ou `null`. Passo menor ou igual
 * a `lastUsedStep` nunca casa: o mesmo código não entra duas vezes.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number,
  lastUsedStep: number | null = null,
): number | null {
  const current = totpStep(nowMs);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta += 1) {
    const step = current + delta;
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (totpCode(secretBase32, step) === code) return step;
  }
  return null;
}

/** Link `otpauth://` que o app autenticador importa (a tela gera o QR no navegador, #250). */
export function otpauthUri(secretBase32: string, accountEmail: string): string {
  const label = `${TOTP_ISSUER}:${encodeURIComponent(accountEmail)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
