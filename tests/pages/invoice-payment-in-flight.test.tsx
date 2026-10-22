// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentForm } from '@/app/(staff)/faturamento/invoice-adjust-forms';
import type { InvoiceDto } from '@/lib/dto';

const invoice = {
  id: 'inv-1',
  patientName: 'Maria Souza',
  balanceCents: 10000,
  paidCents: 0,
} as InvoiceDto;

/**
 * Issue #192 (defesa de UI): durante o PATCH de pagamento nenhum botão de
 * forma de pagamento aceita outro clique — duplo clique não dispara duas
 * requisições. O lock no banco continua sendo a garantia real.
 */
describe('Feature: pagamento em voo (#192)', () => {
  afterEach(() => cleanup());

  it('C23 botão de registrar pagamento fica desabilitado em voo', async () => {
    let resolve: () => void = () => {};
    const onPay = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    render(<PaymentForm invoice={invoice} onPay={onPay} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pix' }));
    const confirm = screen.getByRole('button', {
      name: 'Confirmar recebimento',
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(onPay).toHaveBeenCalledTimes(1);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }

    resolve();
    expect(await screen.findByRole('button', { name: 'Pix' })).toBeEnabled();
  });
});
