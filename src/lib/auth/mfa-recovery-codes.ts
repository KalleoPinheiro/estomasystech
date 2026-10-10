import { randomInt } from 'node:crypto';
import type { RecoveryCodeRecord } from '@/domain/auth/mfa';
import { hashPassword, verifyPassword } from './password';

/**
 * Códigos de recuperação do segundo fator (ADR-007, bloco B2): 10 de uso
 * único, exibidos uma vez, guardados só como hash scrypt (o formato da senha).
 * Sem letras e dígitos que se confundem (i, l, o, 0, 1): ~49 bits por código.
 */
export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const GROUP = 5;
/**
 * Custo do scrypt dos códigos (#208): fica em `2^14`, abaixo do da senha. O
 * custo alto protege segredo de baixa entropia; aqui são ~49 bits aleatórios,
 * e a verificação roda os 10 hashes em paralelo — com `2^17` seriam 1,28 GB.
 */
const RECOVERY_CODE_COST = 16_384;

function randomGroup(): string {
  let group = '';
  for (let i = 0; i < GROUP; i += 1) {
    group += ALPHABET[randomInt(ALPHABET.length)];
  }
  return group;
}

export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) {
    codes.add(`${randomGroup()}-${randomGroup()}`);
  }
  return [...codes];
}

/** Aceita o código como a pessoa o digitar: maiúsculas, espaços, sem hífen. */
export function normalizeRecoveryCode(input: string): string {
  const compact = input.toLowerCase().replace(/[\s-]/g, '');
  return compact.length === GROUP * 2
    ? `${compact.slice(0, GROUP)}-${compact.slice(GROUP)}`
    : compact;
}

export function hashRecoveryCode(code: string): Promise<string> {
  return hashPassword(normalizeRecoveryCode(code), RECOVERY_CODE_COST);
}

/** Registro que casa com o código digitado, ou `null`. */
export async function findMatchingRecoveryCode(
  input: string,
  records: readonly RecoveryCodeRecord[],
): Promise<RecoveryCodeRecord | null> {
  const code = normalizeRecoveryCode(input);
  const matches = await Promise.all(
    records.map((record) => verifyPassword(code, record.codeHash)),
  );
  return records.find((_, index) => matches[index]) ?? null;
}
