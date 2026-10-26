import { describe, expect, it } from 'vitest';
import { unwrapAction } from '@/lib/action-result';
import {
  cancelPayoutSchema,
  closePayoutSchema,
  payoutPaidAt,
} from '@/lib/server/payout-input';
import { rolesWithAccessTo } from '@/lib/staff-pages';

describe('Feature: apoio das telas de Faturamento e Repasses no servidor (#547)', () => {
  it('Dado uma ação que deu certo, Quando desembrulha, Então devolve o dado', async () => {
    await expect(
      unwrapAction(Promise.resolve({ success: true, data: 42, error: null })),
    ).resolves.toBe(42);
  });

  it('Dado uma ação recusada, Quando desembrulha, Então lança a mesma mensagem do envelope', async () => {
    await expect(
      unwrapAction(
        Promise.resolve({
          success: false,
          data: null,
          error: 'Saldo insuficiente',
        }),
      ),
    ).rejects.toThrow('Saldo insuficiente');
  });

  it('Dada a matriz de papéis, Quando pergunta quem usa a API de faturas e de repasses, Então só o Admin de Empresa; o extrato próprio também é do Profissional', () => {
    expect(rolesWithAccessTo('/api/invoices')).toEqual(['company_admin']);
    expect(rolesWithAccessTo('/api/commission-payouts')).toEqual([
      'company_admin',
    ]);
    expect(rolesWithAccessTo('/api/my-payouts')).toEqual([
      'company_admin',
      'profissional',
    ]);
  });

  it('Dado o mês no formato errado, Quando valida o fechamento, Então recusa com a mensagem do formato', () => {
    const result = closePayoutSchema.safeParse({
      professionalId: 'pr-1',
      period: '2020-13',
      paidAt: '2020-04-05',
      paymentMethod: 'pix',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Mês deve estar no formato AAAA-MM',
    );
  });

  it('Dado o motivo do cancelamento, Quando valida, Então aceita até 1000 caracteres', () => {
    expect(
      cancelPayoutSchema.safeParse({ reason: 'x'.repeat(1000) }).success,
    ).toBe(true);
    expect(
      cancelPayoutSchema.safeParse({ reason: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });

  it('Dada a data do pagamento, Quando converte, Então vira meio-dia da clínica e não volta um dia', () => {
    const instant = payoutPaidAt('2020-04-05');

    expect(instant.toISOString().slice(0, 10)).toBe('2020-04-05');
    expect(payoutPaidAt('2020-04-05').getTime()).toBe(instant.getTime());
  });
});
