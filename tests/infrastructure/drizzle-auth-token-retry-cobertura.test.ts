import { describe, expect, it, vi } from 'vitest';
import { AuthToken } from '@/domain/auth/auth-token';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAuthTokenRepository } from '@/infrastructure/persistence/drizzle/drizzle-auth-token-repository';

const violation = () =>
  Object.assign(new Error('duplicado'), { code: '23505' });

const novoConvite = () =>
  AuthToken.issue({ accountId: 'acc-1', purpose: 'invite' }).token;

describe('Feature: Emissão concorrente de token tenta de novo até o índice único garantir um só (#50)', () => {
  it('Dado violação de unicidade na primeira tentativa, Quando substituir o token, Então refaz e conclui', async () => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(violation())
      .mockResolvedValueOnce(undefined);
    const repo = new DrizzleAuthTokenRepository({
      transaction,
    } as unknown as AppDb);

    await repo.replaceUnused(novoConvite());

    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('Dado violação persistente, Quando substituir o token, Então desiste após as tentativas e propaga o erro', async () => {
    const transaction = vi.fn().mockRejectedValue(violation());
    const repo = new DrizzleAuthTokenRepository({
      transaction,
    } as unknown as AppDb);

    await expect(repo.replaceUnused(novoConvite())).rejects.toThrow(
      'duplicado',
    );
    expect(transaction).toHaveBeenCalledTimes(6);
  });

  it('Dado erro que não é de unicidade, Quando substituir o token, Então propaga sem repetir', async () => {
    const transaction = vi.fn().mockRejectedValue(new Error('conexão caiu'));
    const repo = new DrizzleAuthTokenRepository({
      transaction,
    } as unknown as AppDb);

    await expect(repo.replaceUnused(novoConvite())).rejects.toThrow(
      'conexão caiu',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
