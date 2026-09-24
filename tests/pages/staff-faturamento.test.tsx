// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import BillingPage from '@/app/(staff)/faturamento/page';
import type { InvoiceDto, PatientDto, ProcedureDto } from '@/lib/dto';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

const jsonResponse = (
  data: unknown,
  ok = true,
  meta?: { nextCursor: string | null },
) => ({
  ok,
  json: async () => ({ success: ok, data, error: ok ? null : 'Erro', meta }),
});

const errorResponse = (message: string) => ({
  ok: false,
  json: async () => ({ success: false, data: null, error: message }),
});

const mockFetch = (
  router: (call: FetchCall) => { ok: boolean; json: () => Promise<unknown> },
): ReturnType<typeof vi.fn> => {
  const fn = vi.fn(async (url: string, init?: RequestInit) =>
    router({ url, init }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const invoicePending: InvoiceDto = {
  id: 'inv-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  appointmentId: null,
  description: 'Sessão de curativo especializado',
  amountCents: 15000,
  status: 'pending',
  issuedAt: '2026-07-01T12:00:00.000Z',
  dueDate: null,
  paidAt: null,
  paymentMethod: null,
  discountCents: 0,
  discountReason: null,
  netAmountCents: 15000,
  paidCents: 0,
  balanceCents: 15000,
  payments: [],
};

const invoicePaid: InvoiceDto = {
  id: 'inv-2',
  patientId: 'pat-2',
  patientName: 'João Lima',
  appointmentId: null,
  description: 'Troca de bolsa',
  amountCents: 20000,
  status: 'paid',
  issuedAt: '2026-06-15T12:00:00.000Z',
  dueDate: null,
  paidAt: '2026-06-16T12:00:00.000Z',
  paymentMethod: 'pix',
  discountCents: 0,
  discountReason: null,
  netAmountCents: 20000,
  paidCents: 20000,
  balanceCents: 0,
  payments: [
    {
      id: 'pay-1',
      amountCents: 20000,
      method: 'pix',
      paidAt: '2026-06-16T12:00:00.000Z',
    },
  ],
};

const patientFixture: PatientDto = {
  id: 'pat-1',
  fullName: 'Maria Souza',
  email: 'maria@example.com',
  phone: '11999998888',
  birthDate: null,
  notes: null,
  referredByPartnerId: null,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const procedureFixture: ProcedureDto = {
  id: 'proc-1',
  name: 'Troca de bolsa de colostomia',
  priceCents: 12000,
  durationMinutes: 60,
  active: true,
  kitItemCount: 0,
};

const defaultRouter =
  (
    overrides: {
      invoices?: InvoiceDto[];
      patients?: PatientDto[];
      procedures?: ProcedureDto[];
      patchInvoice?: (
        call: FetchCall,
      ) => { ok: boolean; json: () => Promise<unknown> } | null;
      createInvoice?: { ok: boolean; json: () => Promise<unknown> };
      createPackage?: { ok: boolean; json: () => Promise<unknown> };
    } = {},
  ) =>
  ({ url, init }: FetchCall) => {
    const method = init?.method ?? 'GET';

    if (overrides.patchInvoice) {
      const result = overrides.patchInvoice({ url, init });
      if (result) return result;
    }

    if (url === '/api/invoices' && method === 'POST') {
      return overrides.createInvoice ?? jsonResponse(invoicePending);
    }
    if (url === '/api/packages' && method === 'POST') {
      return overrides.createPackage ?? jsonResponse({ id: 'pkg-1' });
    }
    if (url.startsWith('/api/invoices')) {
      return jsonResponse(overrides.invoices ?? []);
    }
    if (url.startsWith('/api/patients')) {
      return jsonResponse(overrides.patients ?? []);
    }
    if (url.startsWith('/api/procedures')) {
      return jsonResponse(overrides.procedures ?? []);
    }
    return jsonResponse(null, false);
  };

describe('Feature: Faturamento', () => {
  describe('Cenário: carregamento e listagem', () => {
    it('Dado que a lista ainda não chegou, Quando renderizar, Então exibe indicador de carregamento', () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/invoices')) {
          return { ok: true, json: () => new Promise(() => {}) };
        }
        return jsonResponse([]);
      });

      renderWithToast(<BillingPage />);

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
    });

    it('Dado nenhuma fatura, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      mockFetch(defaultRouter());

      renderWithToast(<BillingPage />);

      expect(
        await screen.findByText('Nenhuma fatura encontrada.'),
      ).toBeInTheDocument();
    });

    it('Dado faturas pendentes e pagas, Quando a página carrega, Então lista dados e calcula totais', async () => {
      mockFetch(defaultRouter({ invoices: [invoicePending, invoicePaid] }));

      renderWithToast(<BillingPage />);

      expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
      expect(screen.getByText('João Lima')).toBeInTheDocument();
      expect(screen.getAllByText('R$ 150,00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('R$ 200,00').length).toBeGreaterThan(0);
      expect(screen.getByText(/via Pix em 16\/06\/2026/)).toBeInTheDocument();
    });

    it('Dado erro ao carregar faturas, Quando a página carrega, Então exibe alerta de erro', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/invoices')) return jsonResponse(null, false);
        return jsonResponse([]);
      });

      renderWithToast(<BillingPage />);

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('Dado fatura com status desconhecido, Quando renderizada, Então exibe o status bruto como rótulo', async () => {
      const invoiceUnknownStatus: InvoiceDto = {
        ...invoicePending,
        id: 'inv-3',
        patientName: 'Ana Ramos',
        status: 'refunded',
      };
      mockFetch(defaultRouter({ invoices: [invoiceUnknownStatus] }));

      renderWithToast(<BillingPage />);

      expect(await screen.findByText('Ana Ramos')).toBeInTheDocument();
      expect(screen.getByText('refunded')).toBeInTheDocument();
    });

    it('Dado fatura paga com forma de pagamento não mapeada e sem data de pagamento, Quando renderizada, Então exibe o método bruto sem sufixo de data', async () => {
      const invoiceUnknownPayment: InvoiceDto = {
        ...invoicePaid,
        id: 'inv-4',
        patientName: 'Carla Nunes',
        paymentMethod: 'boleto',
        paidAt: null,
        payments: [],
      };
      mockFetch(defaultRouter({ invoices: [invoiceUnknownPayment] }));

      renderWithToast(<BillingPage />);

      expect(await screen.findByText('Carla Nunes')).toBeInTheDocument();
      expect(screen.getByText('boleto')).toBeInTheDocument();
    });
  });

  describe('Cenário: filtros de status', () => {
    it('Dado clique no filtro Pendentes, Quando acionado, Então refaz a busca com status=pending', async () => {
      const fetchMock = mockFetch(
        defaultRouter({ invoices: [invoicePending] }),
      );

      renderWithToast(<BillingPage />);
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Pendentes'));

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes('/api/invoices?status=pending'),
          ),
        ).toBe(true);
      });
    });

    it('Dado os filtros de status, Quando renderizar, Então formam um role=group com aria-pressed no ativo (FAT-01)', async () => {
      mockFetch(defaultRouter({ invoices: [invoicePending] }));

      renderWithToast(<BillingPage />);
      await screen.findByText('Maria Souza');

      expect(
        screen.getByRole('group', { name: 'Filtrar por situação' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Todas')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Pendentes')).toHaveAttribute(
        'aria-pressed',
        'false',
      );

      fireEvent.click(screen.getByText('Pendentes'));

      expect(screen.getByText('Pendentes')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByText('Todas')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  describe('Cenário: alinhamento e ações (FAT-01/03)', () => {
    it('Dado a coluna Valor, Quando renderizar, Então usa text-right e tabular-nums', async () => {
      mockFetch(defaultRouter({ invoices: [invoicePending] }));

      renderWithToast(<BillingPage />);

      const valueCell = await screen.findAllByText('R$ 150,00');
      const cell = valueCell
        .map((el) => el.closest('td'))
        .find((td) => td?.getAttribute('data-label') === 'Valor');
      expect(cell).toHaveClass('text-right', 'tabular-nums');
    });

    it('Dado fatura paga, Quando renderizar a linha, Então a coluna Ações mostra um traço em vez de vazio (FAT-03)', async () => {
      mockFetch(defaultRouter({ invoices: [invoicePaid] }));

      renderWithToast(<BillingPage />);
      await screen.findByText('João Lima');

      const row = screen.getByText('João Lima').closest('tr');
      expect(row).toHaveTextContent('—');
      expect(row?.querySelector('button')).toBeNull();
    });
  });

  describe('Cenário: registrar pagamento', () => {
    it('Dado clique em Receber e escolha do método, Quando confirmado, Então envia PATCH pay e atualiza a lista', async () => {
      const fetchMock = mockFetch(
        defaultRouter({
          invoices: [invoicePending],
          patchInvoice: ({ url, init }) => {
            if (url === '/api/invoices/inv-1' && init?.method === 'PATCH') {
              return jsonResponse({ ...invoicePending, status: 'paid' });
            }
            return null;
          },
        }),
      );

      renderWithToast(<BillingPage />);
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Receber'));
      expect(
        await screen.findByText('Registrar pagamento'),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByText('Pix'));

      await waitFor(() => {
        expect(fetchMock.mock.calls).toContainEqual([
          '/api/invoices/inv-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ action: 'pay', method: 'pix' }),
          }),
        ]);
      });
    });

    it('Dado falha ao registrar pagamento, Quando confirmado, Então exibe alerta de erro', async () => {
      mockFetch(
        defaultRouter({
          invoices: [invoicePending],
          patchInvoice: ({ url, init }) => {
            if (url === '/api/invoices/inv-1' && init?.method === 'PATCH') {
              return errorResponse('Erro ao registrar pagamento');
            }
            return null;
          },
        }),
      );

      renderWithToast(<BillingPage />);
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Receber'));
      fireEvent.click(await screen.findByText('Dinheiro'));

      expect(
        await screen.findByText('Erro ao registrar pagamento'),
      ).toBeInTheDocument();
    });

    it('Dado clique em Fechar no modal de pagamento, Quando acionado, Então fecha sem registrar pagamento', async () => {
      const fetchMock = mockFetch(
        defaultRouter({ invoices: [invoicePending] }),
      );

      renderWithToast(<BillingPage />);
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Receber'));
      expect(
        await screen.findByText('Registrar pagamento'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByText('Registrar pagamento')).not.toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(false);
    });

    it("Dado sucesso ao registrar pagamento, Quando confirmado, Então exibe toast de sucesso 'Pagamento registrado'", async () => {
      mockFetch(
        defaultRouter({
          invoices: [invoicePending],
          patchInvoice: ({ url, init }) => {
            if (url === '/api/invoices/inv-1' && init?.method === 'PATCH') {
              return jsonResponse({ ...invoicePending, status: 'paid' });
            }
            return null;
          },
        }),
      );

      renderWithToast(<BillingPage />);
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Receber'));
      fireEvent.click(await screen.findByText('Pix'));

      await waitFor(() => {
        expect(screen.getByText('Pagamento registrado')).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: cancelar fatura', () => {
    it('Dado clique em Cancelar, Quando acionado, Então envia PATCH cancel e atualiza a lista', async () => {
      const fetchMock = mockFetch(
        defaultRouter({
          invoices: [invoicePending],
          patchInvoice: ({ url, init }) => {
            if (url === '/api/invoices/inv-1' && init?.method === 'PATCH') {
              return jsonResponse({ ...invoicePending, status: 'cancelled' });
            }
            return null;
          },
        }),
      );

      renderWithToast(<BillingPage />);
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Cancelar fatura'));

      await waitFor(() => {
        expect(fetchMock.mock.calls).toContainEqual([
          '/api/invoices/inv-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ action: 'cancel' }),
          }),
        ]);
      });
    });

    it('Dado falha ao cancelar, Quando acionado, Então exibe alerta de erro', async () => {
      mockFetch(
        defaultRouter({
          invoices: [invoicePending],
          patchInvoice: ({ url, init }) => {
            if (url === '/api/invoices/inv-1' && init?.method === 'PATCH') {
              return errorResponse('Erro ao cancelar fatura');
            }
            return null;
          },
        }),
      );

      renderWithToast(<BillingPage />);
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Cancelar fatura'));

      expect(
        await screen.findByText('Erro ao cancelar fatura'),
      ).toBeInTheDocument();
    });

    it("Dado sucesso ao cancelar, Quando acionado, Então exibe toast de sucesso 'Fatura cancelada'", async () => {
      mockFetch(
        defaultRouter({
          invoices: [invoicePending],
          patchInvoice: ({ url, init }) => {
            if (url === '/api/invoices/inv-1' && init?.method === 'PATCH') {
              return jsonResponse({ ...invoicePending, status: 'cancelled' });
            }
            return null;
          },
        }),
      );

      renderWithToast(<BillingPage />);
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Cancelar fatura'));

      await waitFor(() => {
        expect(screen.getByText('Fatura cancelada')).toBeInTheDocument();
      });
    });

    it('Dado clique em Cancelar seguido de cancelamento no dialog, Quando acionado, Então não chama a API', async () => {
      const fetchMock = mockFetch(
        defaultRouter({ invoices: [invoicePending] }),
      );

      renderWithToast(<BillingPage />);
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Cancelar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(false);
    });
  });

  describe('Cenário: emitir nova fatura', () => {
    it('Dado preenchimento do formulário, Quando submetido, Então cria a fatura e fecha o modal', async () => {
      let created = false;
      mockFetch(({ url, init }) => {
        const method = init?.method ?? 'GET';
        if (url === '/api/invoices' && method === 'POST') {
          created = true;
          return jsonResponse(invoicePending);
        }
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return jsonResponse([patientFixture]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('+ Nova fatura'));
      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Descrição/), {
        target: { value: 'Sessão avulsa' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '150' },
      });
      fireEvent.click(screen.getByText('Emitir fatura'));

      await waitFor(() =>
        expect(screen.queryByText('Emitir fatura')).not.toBeInTheDocument(),
      );
      expect(created).toBe(true);
    });

    it('Dado falha ao emitir fatura, Quando submetido, Então exibe alerta de erro no formulário', async () => {
      mockFetch(({ url, init }) => {
        const method = init?.method ?? 'GET';
        if (url === '/api/invoices' && method === 'POST') {
          return errorResponse('Erro ao emitir fatura: dados inválidos');
        }
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return jsonResponse([patientFixture]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('+ Nova fatura'));
      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Descrição/), {
        target: { value: 'Sessão avulsa' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '150' },
      });
      fireEvent.click(screen.getByText('Emitir fatura'));

      expect(
        await screen.findByText('Erro ao emitir fatura: dados inválidos'),
      ).toBeInTheDocument();
      expect(screen.getByText('Emitir fatura')).toBeInTheDocument();
    });

    it('Dado preenchimento com vencimento, Quando submetido, Então envia dueDate convertido para ISO', async () => {
      const fetchMock = mockFetch(({ url, init }) => {
        const method = init?.method ?? 'GET';
        if (url === '/api/invoices' && method === 'POST') {
          return jsonResponse(invoicePending);
        }
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return jsonResponse([patientFixture]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('+ Nova fatura'));
      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Descrição/), {
        target: { value: 'Sessão avulsa' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '150' },
      });
      fireEvent.change(screen.getByLabelText(/Vencimento/), {
        target: { value: '2026-08-01' },
      });
      fireEvent.click(screen.getByText('Emitir fatura'));

      await waitFor(() => {
        expect(fetchMock.mock.calls).toContainEqual([
          '/api/invoices',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              patientId: 'pat-1',
              description: 'Sessão avulsa',
              amountCents: 15000,
              dueDate: new Date('2026-08-01').toISOString(),
            }),
          }),
        ]);
      });
    });

    it('Dado clique em Fechar no modal de nova fatura, Quando acionado, Então fecha sem criar fatura', async () => {
      mockFetch(defaultRouter({ patients: [patientFixture] }));

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('+ Nova fatura'));
      expect(await screen.findByText('Emitir fatura')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByText('Emitir fatura')).not.toBeInTheDocument();
    });

    it('Dado pacientes ainda não carregados, Quando o modal de nova fatura abre, Então exibe apenas a opção padrão', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return { ok: true, json: () => new Promise(() => {}) };
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('+ Nova fatura'));

      const select = (await screen.findByLabelText(
        /Paciente/,
      )) as HTMLSelectElement;
      expect(select.options.length).toBe(1);
      expect(select.options[0]?.value).toBe('');
    });

    it("Dado sucesso ao emitir fatura, Quando submetido, Então exibe toast de sucesso 'Fatura criada'", async () => {
      mockFetch(({ url, init }) => {
        const method = init?.method ?? 'GET';
        if (url === '/api/invoices' && method === 'POST') {
          return jsonResponse(invoicePending);
        }
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return jsonResponse([patientFixture]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('+ Nova fatura'));
      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Descrição/), {
        target: { value: 'Sessão avulsa' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '150' },
      });
      fireEvent.click(screen.getByText('Emitir fatura'));

      await waitFor(() => {
        expect(screen.getByText('Fatura criada')).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: vender pacote de sessões', () => {
    it('Dado clique em Vender pacote e preenchimento, Quando submetido, Então cria o pacote', async () => {
      let createdPackage = false;
      mockFetch(({ url, init }) => {
        const method = init?.method ?? 'GET';
        if (url === '/api/packages' && method === 'POST') {
          createdPackage = true;
          return jsonResponse({ id: 'pkg-1' });
        }
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return jsonResponse([patientFixture]);
        if (url.startsWith('/api/procedures'))
          return jsonResponse([procedureFixture]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('Vender pacote'));
      fireEvent.change(await screen.findByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento/), {
        target: { value: 'proc-1' },
      });
      fireEvent.change(screen.getByLabelText(/Preço total/), {
        target: { value: '1000' },
      });
      fireEvent.click(
        screen.getByText('Vender pacote', { selector: 'button[type=submit]' }),
      );

      await waitFor(() => expect(createdPackage).toBe(true));
    });

    it("Dado sucesso ao vender pacote, Quando submetido, Então exibe toast de sucesso 'Pacote vendido'", async () => {
      mockFetch(({ url, init }) => {
        const method = init?.method ?? 'GET';
        if (url === '/api/packages' && method === 'POST') {
          return jsonResponse({ id: 'pkg-1' });
        }
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return jsonResponse([patientFixture]);
        if (url.startsWith('/api/procedures'))
          return jsonResponse([procedureFixture]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('Vender pacote'));
      fireEvent.change(await screen.findByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento/), {
        target: { value: 'proc-1' },
      });
      fireEvent.change(screen.getByLabelText(/Preço total/), {
        target: { value: '1000' },
      });
      fireEvent.click(
        screen.getByText('Vender pacote', { selector: 'button[type=submit]' }),
      );

      await waitFor(() => {
        expect(screen.getByText('Pacote vendido')).toBeInTheDocument();
      });
    });

    it('Dado nenhum procedimento ativo, Quando o modal de venda abre, Então exibe aviso para cadastrar catálogo', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return jsonResponse([patientFixture]);
        if (url.startsWith('/api/procedures')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('Vender pacote'));

      expect(
        await screen.findByText(
          'Cadastre procedimentos no catálogo para vender pacotes.',
        ),
      ).toBeInTheDocument();
    });

    it('Dado falha ao vender pacote, Quando submetido, Então exibe alerta de erro no formulário', async () => {
      mockFetch(({ url, init }) => {
        const method = init?.method ?? 'GET';
        if (url === '/api/packages' && method === 'POST') {
          return errorResponse('Erro ao vender pacote');
        }
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return jsonResponse([patientFixture]);
        if (url.startsWith('/api/procedures'))
          return jsonResponse([procedureFixture]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('Vender pacote'));
      fireEvent.change(await screen.findByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento/), {
        target: { value: 'proc-1' },
      });
      fireEvent.change(screen.getByLabelText(/Preço total/), {
        target: { value: '1000' },
      });
      fireEvent.click(
        screen.getByText('Vender pacote', { selector: 'button[type=submit]' }),
      );

      expect(
        await screen.findByText('Erro ao vender pacote'),
      ).toBeInTheDocument();
    });

    it('Dado alteração da quantidade de sessões, Quando submetido, Então envia totalSessions atualizado', async () => {
      const fetchMock = mockFetch(({ url, init }) => {
        const method = init?.method ?? 'GET';
        if (url === '/api/packages' && method === 'POST') {
          return jsonResponse({ id: 'pkg-1' });
        }
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return jsonResponse([patientFixture]);
        if (url.startsWith('/api/procedures'))
          return jsonResponse([procedureFixture]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('Vender pacote'));
      fireEvent.change(await screen.findByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento/), {
        target: { value: 'proc-1' },
      });
      fireEvent.change(screen.getByLabelText(/Sessões/), {
        target: { value: '5' },
      });
      fireEvent.change(screen.getByLabelText(/Preço total/), {
        target: { value: '1000' },
      });
      fireEvent.click(
        screen.getByText('Vender pacote', { selector: 'button[type=submit]' }),
      );

      await waitFor(() => {
        expect(fetchMock.mock.calls).toContainEqual([
          '/api/packages',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              patientId: 'pat-1',
              procedureId: 'proc-1',
              totalSessions: 5,
              priceCents: 100000,
              expiresAt: null,
            }),
          }),
        ]);
      });
    });

    it('Dado validade preenchida, Quando vender pacote, Então envia expiresAt no fim do dia (COMP3-07)', async () => {
      const fetchMock = mockFetch(({ url, init }) => {
        const method = init?.method ?? 'GET';
        if (url === '/api/packages' && method === 'POST') {
          return jsonResponse({ id: 'pkg-2' });
        }
        if (url.startsWith('/api/invoices')) return jsonResponse([]);
        if (url.startsWith('/api/patients'))
          return jsonResponse([patientFixture]);
        if (url.startsWith('/api/procedures'))
          return jsonResponse([procedureFixture]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('Vender pacote'));
      fireEvent.change(await screen.findByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento/), {
        target: { value: 'proc-1' },
      });
      fireEvent.change(screen.getByLabelText(/Sessões/), {
        target: { value: '5' },
      });
      fireEvent.change(screen.getByLabelText(/Preço total/), {
        target: { value: '1000' },
      });
      fireEvent.change(screen.getByLabelText(/Validade/), {
        target: { value: '2030-06-30' },
      });
      fireEvent.click(
        screen.getByText('Vender pacote', { selector: 'button[type=submit]' }),
      );

      await waitFor(() => {
        expect(fetchMock.mock.calls).toContainEqual([
          '/api/packages',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              patientId: 'pat-1',
              procedureId: 'proc-1',
              totalSessions: 5,
              priceCents: 100000,
              expiresAt: '2030-06-30T23:59:59.000Z',
            }),
          }),
        ]);
      });
    });

    it('Dado clique em Fechar no modal de venda de pacote, Quando acionado, Então fecha sem criar pacote', async () => {
      mockFetch(
        defaultRouter({
          patients: [patientFixture],
          procedures: [procedureFixture],
        }),
      );

      renderWithToast(<BillingPage />);
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('Vender pacote'));
      expect(
        await screen.findByText('Vender pacote de sessões'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(
        screen.queryByText('Vender pacote de sessões'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cenário: carregar mais', () => {
    it('Dado mais itens disponíveis, Quando clicar em Carregar mais, Então busca a próxima página pelo cursor', async () => {
      const fullPage: InvoiceDto[] = Array.from(
        { length: 100 },
        (_, index) => ({
          ...invoicePending,
          id: `inv-${index}`,
        }),
      );
      const cursor = 'eyJpc3N1ZWRBdCI6IngiLCJpZCI6InkifQ';
      const fetchMock = mockFetch(({ url }) => {
        if (url.startsWith('/api/invoices')) {
          if (url.includes(`cursor=${cursor}`)) return jsonResponse([]);
          return jsonResponse(fullPage, true, { nextCursor: cursor });
        }
        if (url.startsWith('/api/patients')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<BillingPage />);
      await screen.findByText('Carregar mais');

      fireEvent.click(screen.getByText('Carregar mais'));

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes(`cursor=${cursor}`),
          ),
        ).toBe(true);
      });
    });
  });
});
