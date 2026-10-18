// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DiscountForm,
  PaymentForm,
} from '@/app/(staff)/faturamento/invoice-adjust-forms';
import BillingPage from '@/app/(staff)/faturamento/page';
import PaymentReceiptPage from '@/app/documentos/recibo/[invoiceId]/[paymentId]/page';
import type { ReceiptParties } from '@/domain/billing/receipt';
import { CNPJ_UNDER_REVIEW_MESSAGE } from '@/domain/billing/receipt';
import type { ClinicInfoDto, InvoiceDto } from '@/lib/dto';
import { renderWithToast } from '../support/render-with-toast';

interface Call {
  url: string;
  method: string;
  body: string | null;
}
interface FakeResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}
const ok = (data: unknown): FakeResponse => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});
const failure = (error: string): FakeResponse => ({
  ok: false,
  json: async () => ({ success: false, data: null, error }),
});

const base: InvoiceDto = {
  id: 'inv-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  appointmentId: null,
  description: 'Curativo especializado',
  amountCents: 20000,
  status: 'pending',
  issuedAt: '2026-07-01T12:00:00.000Z',
  dueDate: null,
  paidAt: null,
  paymentMethod: null,
  discountCents: 0,
  discountReason: null,
  netAmountCents: 20000,
  paidCents: 0,
  balanceCents: 20000,
  payments: [],
};
const partial: InvoiceDto = {
  ...base,
  discountCents: 2000,
  discountReason: 'Fidelidade',
  netAmountCents: 18000,
  paidCents: 5000,
  balanceCents: 13000,
  payments: [
    {
      id: 'pay-1',
      amountCents: 5000,
      method: 'pix',
      paidAt: '2026-07-02T12:00:00.000Z',
      payer: null,
    },
  ],
};

function mockFetch(
  handler: (url: string, method: string) => FakeResponse | undefined,
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: (init?.body as string) ?? null });
      const response = handler(url, method);
      if (!response) throw new Error(`URL não mapeada: ${method} ${url}`);
      return response;
    }),
  );
  return calls;
}

const billingRouter =
  (invoices: InvoiceDto[], patch?: () => FakeResponse) =>
  (url: string, method: string) => {
    if (method === 'PATCH') return patch ? patch() : ok(invoices[0]);
    if (url.startsWith('/api/invoices/summary')) {
      return ok({
        paidCents: 5000,
        pendingCents: 13000,
        totalInvoices: 1,
        paidCount: 0,
        pendingCount: 1,
        cancelledCount: 0,
      });
    }
    if (url.startsWith('/api/invoices')) return ok(invoices);
    if (url.startsWith('/api/patients')) return ok([]);
    return undefined;
  };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Recebimento e desconto (formulários)', () => {
  it('Dado saldo de R$ 130, Quando receber R$ 30, Então avisa o parcial e envia o valor com a forma', async () => {
    const onPay = vi.fn().mockResolvedValue(undefined);
    render(<PaymentForm invoice={partial} onPay={onPay} />);

    expect(screen.getByLabelText('Valor recebido (R$)')).toHaveValue(130);
    expect(screen.getByText(/já recebido R\$ 50,00/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Valor recebido (R$)'), {
      target: { value: '30' },
    });
    expect(screen.getByText(/fica faltando R\$ 100,00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pix' }));
    await waitFor(() => expect(onPay).toHaveBeenCalledWith(3000, 'pix', null));
  });

  it('Dado valor zerado, Então as formas de pagamento ficam desabilitadas', () => {
    render(<PaymentForm invoice={base} onPay={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Valor recebido (R$)'), {
      target: { value: '0' },
    });
    expect(screen.getByRole('button', { name: 'Pix' })).toBeDisabled();
  });

  it('Dado desconto com motivo, Quando aplicar, Então mostra o valor a cobrar e envia centavos; erro fica no formulário', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('abaixo do já recebido'))
      .mockResolvedValueOnce(undefined);
    render(<DiscountForm invoice={base} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '25.5' },
    });
    fireEvent.change(screen.getByLabelText('Motivo *'), {
      target: { value: 'Fidelidade' },
    });
    expect(screen.getByText(/Valor a cobrar: R\$ 174,50/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar desconto' }));
    expect(
      await screen.findByText('abaixo do já recebido'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar desconto' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith(2550, 'Fidelidade'),
    );
  });
});

describe('Feature: Faturamento com parcial, desconto e recibos', () => {
  it('Dado fatura com desconto e parcial, Quando listar, Então mostra original riscado, líquido, saldo, recebimento com recibo e esconde Cancelar', async () => {
    mockFetch(billingRouter([partial]));
    renderWithToast(<BillingPage />);

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('R$ 200,00')).toHaveClass('line-through');
    expect(screen.getByText('falta R$ 130,00')).toBeInTheDocument();
    expect(screen.getByText(/R\$ 50,00 via Pix em/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recibo' })).toHaveAttribute(
      'href',
      '/documentos/recibo/inv-1/pay-1',
    );
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  it('Dado recebimento parcial, Quando registrar, Então envia pay_partial e avisa', async () => {
    const calls = mockFetch(billingRouter([base]));
    renderWithToast(<BillingPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Receber' }));
    fireEvent.change(await screen.findByLabelText('Valor recebido (R$)'), {
      target: { value: '50' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pix' }));

    expect(
      await screen.findByText('Pagamento parcial registrado'),
    ).toBeInTheDocument();
    expect(
      JSON.parse(calls.find((c) => c.method === 'PATCH')?.body ?? '{}'),
    ).toEqual({
      action: 'pay_partial',
      amountCents: 5000,
      method: 'pix',
    });
  });

  it('Dado desconto, Quando aplicar pela tela, Então envia a ação e fecha o modal', async () => {
    const calls = mockFetch(billingRouter([base]));
    renderWithToast(<BillingPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desconto' }));
    fireEvent.change(await screen.findByLabelText('Desconto (R$)'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText('Motivo *'), {
      target: { value: 'Acordo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar desconto' }));

    expect(await screen.findByText('Desconto aplicado')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      JSON.parse(calls.find((c) => c.method === 'PATCH')?.body ?? '{}'),
    ).toEqual({
      action: 'discount',
      amountCents: 2000,
      reason: 'Acordo',
    });
  });

  it('Dado erro da API no desconto, Então a mensagem aparece no modal', async () => {
    mockFetch(
      billingRouter([base], () => failure('Motivo do desconto é obrigatório')),
    );
    renderWithToast(<BillingPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desconto' }));
    fireEvent.change(await screen.findByLabelText('Motivo *'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar desconto' }));
    expect(
      await screen.findByText('Motivo do desconto é obrigatório'),
    ).toBeInTheDocument();
  });
});

const CLINIC: ClinicInfoDto = {
  name: 'Clínica VittaFlow',
  cnpj: '12.345.678/0001-95',
  address: 'Rua das Flores, 100',
  city: 'São Paulo',
  professionalName: 'Enf. Resp.',
  professionalRegistry: 'COREN-SP 1',
};

const PARTIES: ReceiptParties = {
  payer: { name: 'Maria Souza', document: '529.982.247-25' },
  provider: { name: 'Clínica VittaFlow', document: '12.345.678/0001-95' },
  payerIsPatient: true,
};

const renderReceipt = async (
  invoice: InvoiceDto | null,
  paymentId: string,
  clinic: ClinicInfoDto = CLINIC,
  receipt: FakeResponse = ok(PARTIES),
) => {
  const calls = mockFetch((url) => {
    if (url === '/api/clinic-info') return ok(clinic);
    if (url === `/api/invoices/inv-1/payments/${paymentId}/receipt`) {
      return receipt;
    }
    if (url === '/api/documents/issue') {
      return ok({
        documentNumber: 'REC-ABCD1234',
        issuedAt: '2026-07-03T10:00:00.000Z',
      });
    }
    if (url === '/api/invoices/inv-1') {
      return invoice ? ok(invoice) : failure('Fatura não encontrada');
    }
    return undefined;
  });
  await act(async () => {
    renderWithToast(
      <PaymentReceiptPage
        params={Promise.resolve({ invoiceId: 'inv-1', paymentId })}
      />,
    );
  });
  return calls;
};

describe('Feature: Recibo de pagamento', () => {
  it('Dado pagamento parcial, Quando abrir o recibo, Então mostra quem pagou, quanto, como, o desconto e o saldo restante', async () => {
    await renderReceipt(partial, 'pay-1');

    expect(await screen.findByText('Recibo')).toBeInTheDocument();
    expect(
      screen.getByText('REC-ABCD1234', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('Pix')).toBeInTheDocument();
    expect(screen.getByText('Curativo especializado')).toBeInTheDocument();
    expect(screen.getByText('Desconto (Fidelidade)')).toBeInTheDocument();
    expect(screen.getByText('R$ 130,00')).toBeInTheDocument();
    expect(
      screen.getByText(/Pagamento parcial: a fatura continua em aberto/),
    ).toBeInTheDocument();
  });

  it('Dado pagamento que quita, Então o rodapé diz que quita a fatura', async () => {
    await renderReceipt(
      {
        ...base,
        status: 'paid',
        paidCents: 20000,
        balanceCents: 0,
        payments: [
          {
            id: 'pay-9',
            amountCents: 20000,
            method: 'cash',
            paidAt: '2026-07-02T12:00:00.000Z',
            payer: null,
          },
        ],
      },
      'pay-9',
    );
    expect(
      await screen.findByText('Este pagamento quita a fatura.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Desconto/)).toBeNull();
  });

  it('Dado dois pagamentos, Quando abrir o recibo do primeiro, Então o recebido e o saldo são os daquele momento', async () => {
    await renderReceipt(
      {
        ...partial,
        paidCents: 8000,
        balanceCents: 10000,
        payments: [
          ...partial.payments,
          {
            id: 'pay-2',
            amountCents: 3000,
            method: 'cash',
            paidAt: '2026-07-05T12:00:00.000Z',
            payer: null,
          },
        ],
      },
      'pay-1',
    );
    const row = (label: string) =>
      screen.getByText(label).closest('tr') as HTMLElement;
    expect(
      await screen.findByText('Recebido até este recibo'),
    ).toBeInTheDocument();
    expect(row('Recebido até este recibo')).toHaveTextContent('R$ 50,00');
    expect(row('Saldo restante')).toHaveTextContent('R$ 130,00');
  });

  it('Dado pagamento que não é da fatura, Então avisa', async () => {
    await renderReceipt(partial, 'outro');
    expect(
      await screen.findByText('Pagamento não encontrado nesta fatura.'),
    ).toBeInTheDocument();
  });

  it('Dado clínica sem CNPJ, Então bloqueia a emissão', async () => {
    await renderReceipt(partial, 'pay-1', { ...CLINIC, cnpj: '' });
    expect(await screen.findByText(/Clínica sem CNPJ/)).toBeInTheDocument();
  });

  it('Dado paciente sem CPF, Quando abrir o recibo, Então bloqueia com a orientação e não emite', async () => {
    const calls = mockFetch((url) => {
      if (url === '/api/clinic-info') return ok(CLINIC);
      if (url === '/api/invoices/inv-1') return ok(partial);
      if (url === '/api/invoices/inv-1/payments/pay-1/receipt') {
        return failure('O paciente não tem CPF cadastrado.');
      }
      return undefined;
    });
    await act(async () => {
      renderWithToast(
        <PaymentReceiptPage
          params={Promise.resolve({ invoiceId: 'inv-1', paymentId: 'pay-1' })}
        />,
      );
    });
    expect(
      await screen.findByText('O paciente não tem CPF cadastrado.'),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/documents/issue')).toBe(false);
  });

  it('Dado CNPJ marcado para correção, Quando abrir o recibo, Então bloqueia e leva às Configurações (#358)', async () => {
    const calls = mockFetch((url) => {
      if (url === '/api/clinic-info') return ok(CLINIC);
      if (url === '/api/invoices/inv-1') return ok(partial);
      if (url === '/api/invoices/inv-1/payments/pay-1/receipt') {
        return failure(CNPJ_UNDER_REVIEW_MESSAGE);
      }
      return undefined;
    });
    await act(async () => {
      renderWithToast(
        <PaymentReceiptPage
          params={Promise.resolve({ invoiceId: 'inv-1', paymentId: 'pay-1' })}
        />,
      );
    });
    expect(
      await screen.findByText(CNPJ_UNDER_REVIEW_MESSAGE),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Corrigir o CNPJ nas Configurações' }),
    ).toHaveAttribute('href', '/configuracoes');
    expect(calls.some((c) => c.url === '/api/documents/issue')).toBe(false);
  });

  it('Dado CPF e CNPJ, Quando abrir o recibo, Então o texto traz os dois documentos e a emissão leva a fatura', async () => {
    const calls = await renderReceipt(partial, 'pay-1');
    expect(await screen.findByText(/CPF 529\.982\.247-25/)).toBeInTheDocument();
    expect(screen.getByText(/CNPJ 12\.345\.678\/0001-95/)).toBeInTheDocument();
    const issue = calls.find((c) => c.url === '/api/documents/issue');
    expect(JSON.parse(issue?.body ?? '{}')).toEqual({
      documentType: 'recibo',
      resourceId: 'pay-1',
      invoiceId: 'inv-1',
    });
  });

  it('Dado pagador diferente do paciente, Então o recibo sai no nome do pagador e cita o paciente', async () => {
    await renderReceipt(
      partial,
      'pay-1',
      CLINIC,
      ok({
        ...PARTIES,
        payer: { name: 'João Souza', document: '111.444.777-35' },
        payerIsPatient: false,
      }),
    );
    expect(await screen.findByText('João Souza')).toBeInTheDocument();
    expect(screen.getByText(/CPF 111\.444\.777-35/)).toBeInTheDocument();
    expect(screen.getByText(/paciente: Maria Souza/)).toBeInTheDocument();
  });

  it('Dado fatura inacessível, Então mostra o erro', async () => {
    await renderReceipt(null, 'pay-1');
    expect(
      await screen.findByText('Fatura não encontrada'),
    ).toBeInTheDocument();
  });
});

describe('Feature: Fatura parcial no portal do paciente', () => {
  it('Dado fatura com pagamento parcial, Quando abrir o portal, Então mostra o líquido, o pago e o que falta', async () => {
    const { PatientPortalView } = await import('@/app/portal/patient-view');
    mockFetch((url) => {
      if (url.startsWith('/api/portal/patient/consent')) {
        return ok({ consentText: 'Termo', accepted: true, acceptedAt: null });
      }
      if (url.startsWith('/api/portal/patient/waitlist')) return ok([]);
      if (url.startsWith('/api/portal/patient')) {
        return ok({
          patient: {
            id: 'pat-1',
            fullName: 'Maria Souza',
            email: 'm@x.com',
            phone: null,
          },
          appointments: [],
          conditions: [],
          invoices: [partial],
          followUps: [],
        });
      }
      return undefined;
    });
    renderWithToast(<PatientPortalView />);

    expect(await screen.findByText('R$ 180,00')).toBeInTheDocument();
    expect(
      screen.getByText(/pago R\$ 50,00 · falta\s+R\$ 130,00/),
    ).toBeInTheDocument();
  });
});

describe('Feature: Pagador distinto do paciente no recebimento (#326)', () => {
  const clickPix = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Pix' }));

  it('Dado "quem pagou não é o paciente" com nome e CPF, Quando receber, Então envia o pagador junto', async () => {
    const onPay = vi.fn(async () => {});
    render(<PaymentForm invoice={partial} onPay={onPay} />);

    fireEvent.click(screen.getByLabelText('Quem pagou não é o paciente'));
    fireEvent.change(screen.getByLabelText('Nome do pagador *'), {
      target: { value: 'João Souza' },
    });
    fireEvent.change(screen.getByLabelText('CPF do pagador *'), {
      target: { value: '111.444.777-35' },
    });
    clickPix();

    await waitFor(() =>
      expect(onPay).toHaveBeenCalledWith(13000, 'pix', {
        name: 'João Souza',
        cpf: '111.444.777-35',
      }),
    );
  });

  it('Dado CPF do pagador inválido, Quando receber, Então avisa e não envia', async () => {
    const onPay = vi.fn(async () => {});
    render(<PaymentForm invoice={partial} onPay={onPay} />);

    fireEvent.click(screen.getByLabelText('Quem pagou não é o paciente'));
    fireEvent.change(screen.getByLabelText('Nome do pagador *'), {
      target: { value: 'João Souza' },
    });
    fireEvent.change(screen.getByLabelText('CPF do pagador *'), {
      target: { value: '123.456.789-00' },
    });
    clickPix();

    expect(await screen.findByText(/CPF inválido/)).toBeInTheDocument();
    expect(onPay).not.toHaveBeenCalled();
  });

  it('Dado a faturamento, Quando receber com pagador, Então o PATCH leva payerName e payerCpf', async () => {
    const calls = mockFetch(billingRouter([base]));
    renderWithToast(<BillingPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Receber' }));
    fireEvent.click(
      await screen.findByLabelText('Quem pagou não é o paciente'),
    );
    fireEvent.change(screen.getByLabelText('Nome do pagador *'), {
      target: { value: 'João Souza' },
    });
    fireEvent.change(screen.getByLabelText('CPF do pagador *'), {
      target: { value: '111.444.777-35' },
    });
    clickPix();

    await screen.findByText('Pagamento registrado');
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(JSON.parse(patch?.body ?? '{}')).toMatchObject({
      action: 'pay',
      method: 'pix',
      payerName: 'João Souza',
      payerCpf: '111.444.777-35',
    });
  });

  it('Dado pagamento já feito por outra pessoa, Então a lista mostra quem pagou', async () => {
    mockFetch(
      billingRouter([
        {
          ...partial,
          payments: [
            {
              ...partial.payments[0],
              payer: { name: 'João Souza', cpfMasked: '***.***.777-**' },
            },
          ],
        },
      ]),
    );
    renderWithToast(<BillingPage />);

    expect(await screen.findByText(/pago por João Souza/)).toBeInTheDocument();
  });
});
