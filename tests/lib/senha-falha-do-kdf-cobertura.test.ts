import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hashPassword,
  simulatePasswordCheck,
  verifyPassword,
} from '@/lib/auth/password';

const kdf = vi.hoisted(() => ({ failing: false }));

// Falha do scrypt (ex.: falta de memória) só é reproduzível trocando o KDF.
vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return {
    ...original,
    scrypt: ((...args: Parameters<typeof original.scrypt>) => {
      if (!kdf.failing) return original.scrypt(...args);
      const callback = args[args.length - 1] as (error: Error) => void;
      callback(new Error('memória insuficiente'));
    }) as typeof original.scrypt,
  };
});

describe('Feature: Senha com falha do derivador de chave (#208)', () => {
  beforeEach(() => {
    kdf.failing = false;
  });

  it('Dado falha do scrypt ao criar o hash, Quando cadastrar a senha, Então o erro sobe e nada é gravado', async () => {
    kdf.failing = true;

    await expect(hashPassword('senha-forte-123')).rejects.toThrow(
      'memória insuficiente',
    );
  });

  it('Dado falha do scrypt na conta fantasma, Quando simular a verificação, Então responde falso sem lançar', async () => {
    kdf.failing = true;

    await expect(simulatePasswordCheck('qualquer')).resolves.toBe(false);
  });

  it('Dado hash válido e falha do scrypt na verificação, Quando conferir a senha, Então nega sem lançar (nunca autentica)', async () => {
    const stored = await hashPassword('senha-forte-123');
    kdf.failing = true;

    await expect(verifyPassword('senha-forte-123', stored)).resolves.toBe(
      false,
    );
  });
});
