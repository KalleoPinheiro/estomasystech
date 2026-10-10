import { scrypt } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hashPassword,
  PASSWORD_COST,
  UNSET_PASSWORD_HASH,
  verifyPassword,
} from '@/lib/auth/password';

// Espiona o scrypt sem trocar o comportamento: prova que o caminho "sem senha
// usável" gasta um scrypt do custo atual, como uma verificação real (#208).
vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return { ...original, scrypt: vi.fn(original.scrypt) };
});

const paramsUsed = () =>
  vi.mocked(scrypt).mock.calls.map((call) => {
    const { N, r, p } = call[3] as unknown as {
      N: number;
      r: number;
      p: number;
    };
    return { N, r, p };
  });

describe('Feature: verificação de senha sem atalho de tempo (#208)', () => {
  beforeEach(() => {
    vi.mocked(scrypt).mockClear();
  });

  it.each([
    ['convite pendente', UNSET_PASSWORD_HASH],
    ['formato inválido', 'formato-invalido'],
    ['custo fora da faixa', 'scrypt$500$salt$abcd'],
  ])(
    'Dado hash de %s, Quando verifyPassword, Então roda um scrypt do custo atual e responde false',
    async (_label, stored) => {
      expect(await verifyPassword('qualquer', stored)).toBe(false);

      expect(paramsUsed()).toEqual([{ N: PASSWORD_COST, r: 8, p: 1 }]);
    },
  );

  it('Dado senha nova, Quando hashPassword, Então usa N=2^17, r=8, p=1 (OWASP)', async () => {
    await hashPassword('s3nh@forte');

    expect(paramsUsed()).toEqual([{ N: PASSWORD_COST, r: 8, p: 1 }]);
  });
});
