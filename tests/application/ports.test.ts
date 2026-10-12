import { describe, expect, it, vi } from 'vitest';
import { NullCalendarGateway } from '@/application/ports/calendar-gateway';
import { NullMessagingGateway } from '@/application/ports/messaging-gateway';
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
  });

  it('Dado NullMessagingGateway, Quando enabled, Então false e sendText não lança', async () => {
    const gateway = new NullMessagingGateway();

    expect(gateway.enabled).toBe(false);
    await expect(
      gateway.sendText('11999999999', 'oi'),
    ).resolves.toBeUndefined();
  });

  it('Dado NullMessagingGateway, Quando sendText, Então loga telefone mascarado e nunca o corpo (CWE-532)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const body = 'Olá, Maria Silva! Sua consulta é em 10/10 às 14:00.';

    await new NullMessagingGateway().sendText('+5511999997777', body);

    expect(info).toHaveBeenCalledTimes(1);
    const logged = String(info.mock.calls[0][0]);
    expect(JSON.parse(logged).msg).toBe(
      `[mensageria desativada] WhatsApp para +55******7777 (${body.length} caracteres)`,
    );
    expect(logged).not.toContain('5511999997777');
    expect(logged).not.toContain('Maria');
    info.mockRestore();
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
