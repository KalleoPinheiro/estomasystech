import { describe, expect, it } from 'vitest';
import {
  findMatchingRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from '@/lib/auth/mfa-recovery-codes';

describe('Feature: Códigos de recuperação do segundo fator (B2)', () => {
  it('Dado um cadastro, Quando gerar os códigos, Então gera 10 códigos distintos no formato xxxxx-xxxxx com hash scrypt', async () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
    }
    const hash = await hashRecoveryCode(codes[0]);
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain(codes[0]);
  });

  it('Dado o código digitado com maiúsculas, espaços ou sem hífen, Quando verificar, Então normaliza e encontra o registro', async () => {
    const [code, other] = generateRecoveryCodes();
    const records = [
      { id: 'a', codeHash: await hashRecoveryCode(other) },
      { id: 'b', codeHash: await hashRecoveryCode(code) },
    ];
    const typed = ` ${code.toUpperCase().replace('-', ' ')} `;
    expect(normalizeRecoveryCode(typed)).toBe(code);
    expect(normalizeRecoveryCode(code.replace('-', ''))).toBe(code);
    expect((await findMatchingRecoveryCode(typed, records))?.id).toBe('b');
    expect(await findMatchingRecoveryCode('zzzzz-zzzzz', records)).toBeNull();
  });
});
