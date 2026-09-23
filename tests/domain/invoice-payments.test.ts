import { describe, expect, it } from 'vitest';
import { Invoice } from '@/domain/billing/invoice';
import {
  ConflictError,
  InvalidStatusTransitionError,
  ValidationError,
} from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';

const cents = Money.fromCents;
const invoice = () =>
  Invoice.create({
    patientId: 'pat-1',
    description: 'Curativo',
    amount: cents(20000),
  });
const day = (d: number) =>
  new Date(`2026-07-${String(d).padStart(2, '0')}T12:00:00Z`);

describe('Feature: Pagamento parcial de fatura', () => {
  it('Dado fatura de R$ 200, Quando receber R$ 50, Então continua pendente com saldo de R$ 150', () => {
    const partial = invoice().registerPayment({
      amount: cents(5000),
      method: 'pix',
      paidAt: day(1),
    });
    expect(partial.status).toBe('pending');
    expect(partial.paid.cents).toBe(5000);
    expect(partial.balance.cents).toBe(15000);
    expect(partial.paidAt).toBeNull();
    expect(partial.payments).toHaveLength(1);
  });

  it('Dado parcial, Quando receber o saldo, Então quita com data e forma do último pagamento', () => {
    const paid = invoice()
      .registerPayment({ amount: cents(5000), method: 'pix', paidAt: day(1) })
      .registerPayment({
        amount: cents(15000),
        method: 'cash',
        paidAt: day(9),
      });
    expect(paid.status).toBe('paid');
    expect(paid.paidAt).toEqual(day(9));
    expect(paid.paymentMethod).toBe('cash');
    expect(paid.balance.cents).toBe(0);
    expect(paid.paid.cents).toBe(20000);
  });

  it('Dado parcial, Quando "marcar como paga", Então recebe exatamente o saldo', () => {
    const paid = invoice()
      .registerPayment({ amount: cents(5000), method: 'pix' })
      .markPaid('credit_card', day(3));
    expect(paid.status).toBe('paid');
    expect(paid.payments.map((p) => p.amount.cents)).toEqual([5000, 15000]);
  });

  it('Dado pagamento maior que o saldo ou zero, Então ValidationError', () => {
    expect(() =>
      invoice().registerPayment({ amount: cents(20001), method: 'pix' }),
    ).toThrow('Pagamento maior que o saldo');
    expect(() =>
      invoice().registerPayment({ amount: cents(0), method: 'pix' }),
    ).toThrow(ValidationError);
  });

  it('Dado fatura paga ou cancelada, Quando receber, Então InvalidStatusTransition', () => {
    const paid = invoice().markPaid('pix');
    expect(() =>
      paid.registerPayment({ amount: cents(1), method: 'pix' }),
    ).toThrow(InvalidStatusTransitionError);
    expect(() =>
      invoice()
        .cancel()
        .registerPayment({ amount: cents(1), method: 'pix' }),
    ).toThrow(InvalidStatusTransitionError);
  });

  it('Dado pagamento parcial, Quando cancelar, Então ConflictError orientando o desconto', () => {
    const partial = invoice().registerPayment({
      amount: cents(5000),
      method: 'pix',
    });
    expect(() => partial.cancel()).toThrow(ConflictError);
  });

  it('Dado fatura paga do histórico (sem recebimentos gravados), Então recebido = líquido e saldo zero', () => {
    const legacy = Invoice.restore({
      id: 'inv-legacy',
      patientId: 'pat-1',
      description: 'Antiga',
      amount: cents(10000),
      status: 'paid',
      issuedAt: day(1),
      paidAt: day(2),
      paymentMethod: 'pix',
    });
    expect(legacy.paid.cents).toBe(10000);
    expect(legacy.balance.cents).toBe(0);
    expect(legacy.discount).toBeNull();
    expect(legacy.payments).toEqual([]);
  });
});

describe('Feature: Desconto em fatura', () => {
  it('Dado fatura pendente, Quando dar desconto com motivo, Então o líquido e o saldo caem', () => {
    const discounted = invoice().applyDiscount(cents(5000), '  Fidelidade ');
    expect(discounted.discount).toEqual({
      amount: cents(5000),
      reason: 'Fidelidade',
    });
    expect(discounted.netAmount.cents).toBe(15000);
    expect(discounted.balance.cents).toBe(15000);
    expect(discounted.amount.cents).toBe(20000);
  });

  it('Dado desconto, Quando dar outro, Então substitui; zero remove', () => {
    const replaced = invoice()
      .applyDiscount(cents(5000), 'A')
      .applyDiscount(cents(2000), 'B');
    expect(replaced.netAmount.cents).toBe(18000);
    expect(
      replaced.applyDiscount(cents(0), 'Sem desconto').discount,
    ).toBeNull();
  });

  it.each([
    ['sem motivo', 1000, '  '],
    ['motivo longo', 1000, 'x'.repeat(201)],
    ['desconto total', 20000, 'Cortesia'],
  ])('Dado %s, Então ValidationError', (_, value, reason) => {
    expect(() => invoice().applyDiscount(cents(value), reason)).toThrow(
      ValidationError,
    );
  });

  it('Dado R$ 150 já recebidos, Quando o desconto deixaria o líquido abaixo disso, Então ValidationError', () => {
    const partial = invoice().registerPayment({
      amount: cents(15000),
      method: 'pix',
    });
    expect(() => partial.applyDiscount(cents(6000), 'Erro')).toThrow(
      'abaixo do já recebido',
    );
  });

  it('Dado R$ 150 já recebidos, Quando o desconto iguala o líquido ao recebido, Então a fatura quita com o último pagamento', () => {
    const settled = invoice()
      .registerPayment({ amount: cents(15000), method: 'pix', paidAt: day(4) })
      .applyDiscount(cents(5000), 'Acerto');
    expect(settled.status).toBe('paid');
    expect(settled.paidAt).toEqual(day(4));
    expect(settled.paymentMethod).toBe('pix');
    expect(settled.balance.cents).toBe(0);
  });

  it('Dado fatura paga, Quando dar desconto, Então InvalidStatusTransition', () => {
    expect(() =>
      invoice().markPaid('pix').applyDiscount(cents(100), 'x'),
    ).toThrow(InvalidStatusTransitionError);
  });
});
