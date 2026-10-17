import { describe, expect, it } from 'vitest';
import { NullCalendarGateway } from '@/application/ports/calendar-gateway';
import {
  NoTransactionManager,
  type TransactionScope,
} from '@/application/ports/transaction-manager';

describe('Feature: Gateways nulos (integrações desativadas)', () => {
  it('Dado NullCalendarGateway, Quando chamado, Então createEvent retorna null e update/delete não lançam', async () => {
    const gateway = new NullCalendarGateway();

    await expect(gateway.createEvent()).resolves.toBeNull();
    await expect(gateway.updateEvent()).resolves.toBeUndefined();
    await expect(gateway.deleteEvent()).resolves.toBeUndefined();
    await expect(gateway.rewriteEvent()).resolves.toBeUndefined();
    await expect(gateway.purgeEvent()).resolves.toBeUndefined();
  });
});

describe('Feature: Unidade de trabalho sem transação (NoTransactionManager)', () => {
  it('Dado repositórios injetados, Quando run, Então executa a função com eles e propaga o retorno (CONS2-03)', async () => {
    const repos = { marker: 'scope' } as unknown as TransactionScope;
    const manager = new NoTransactionManager(repos);

    const result = await manager.run(async (received) => {
      expect(received).toBe(repos);
      return 42;
    });

    expect(result).toBe(42);
  });

  it('Dado função que rejeita, Quando run, Então propaga o erro', async () => {
    const manager = new NoTransactionManager({} as TransactionScope);

    await expect(
      manager.run(async () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
  });
});
