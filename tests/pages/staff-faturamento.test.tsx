// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickPatient } from '@/../tests/support/patient-picker';
import BillingPage from '@/app/(staff)/faturamento/page';
import Loading from '@/app/(staff)/loading';
import type { InvoiceDto, PatientDto, ProcedureDto } from '@/lib/dto';
import {
  actionError,
  actionOk,
  billing,
  mockBillingData,
  resetBillingData,
} from '../support/billing-data';
import { renderWithToast } from '../support/render-with-toast';
import { renderServerPage } from '../support/server-page';

vi.mock('next/navigation', async () => {
  const { billing } = await import('../support/billing-data');
  return {
    useRouter: () => ({ refresh: billing.refresh, push: vi.fn() }),
    usePathname: () => '/faturamento',
  };
});
vi.mock('@/lib/server/session', async () => {
  const { billing } = await import('../support/billing-data');
  return { requireStaffPageFor: billing.requireStaffPageFor };
});
vi.mock('@/lib/server/data/invoices', async () => {
  const { billing } = await import('../support/billing-data');
  return {
    listInvoicesFor: billing.listInvoicesFor,
    getInvoiceSummaryFor: billing.getInvoiceSummaryFor,
  };
});
vi.mock('@/lib/server/data/procedures', async () => {
  const { billing } = await import('../support/billing-data');
  return { listProceduresFor: billing.listProceduresFor };
});
vi.mock('@/app/(staff)/faturamento/billing-actions', async () => {
  const { billing } = await import('../support/billing-data');
  return {
    createInvoice: billing.createInvoice,
    updateInvoice: billing.updateInvoice,
    sellPackage: billing.sellPackage,
  };
});

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

/**
 * O que continua pela API depois do servidor: a busca de pacientes do
 * `PatientPicker` (digitada pelo usuário) e as páginas seguintes de «Carregar
 * mais» (exceções do ADR-069).
 */
const mockFetch = (
  router: (call: FetchCall) => { ok: boolean; json: () => Promise<unknown> },
): ReturnType<typeof vi.fn> => {
  const fn = vi.fn(async (url: string, init?: RequestInit) =>
    router({ url, init }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
};

const patientsFetch = (patients: PatientDto[] = []) =>
  mockFetch(({ url }) =>
    url.startsWith('/api/patients')
      ? jsonResponse(patients)
      : jsonResponse(null, false),
  );

beforeEach(() => {
  resetBillingData();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Renderiza a tela no servidor, para a situação pedida na URL. */
const renderBilling = (status?: string) =>
  renderServerPage(() =>
    BillingPage({ searchParams: Promise.resolve({ status }) }),
  );

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
      payer: null,
    },
  ],
};

const patientFixture: PatientDto = {
  id: 'pat-1',
  fullName: 'Maria Souza',
  email: 'maria@example.com',
  phone: '11999998888',
  phoneNeedsCorrection: false,
  cpfMasked: null,
  birthDate: null,
  notes: null,
  referredByPartnerId: null,
  guardianId: null,
  guardianPortalRevokedAt: null,
  active: true,
  anonymized: false,
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

const PACKAGE_FORM = {
  patientId: 'pat-1',
  procedureId: 'proc-1',
  totalSessions: 10,
  priceCents: 100000,
  expiresAt: null,
};

/** Preenche o modal de venda de pacote com o paciente, o procedimento e o preço. */
const fillPackage = async (sessions?: string) => {
  fireEvent.click(screen.getByText('Vender pacote'));
  await pickPatient('Maria Souza');
  fireEvent.change(screen.getByLabelText(/Procedimento/), {
    target: { value: 'proc-1' },
  });
  if (sessions) {
    fireEvent.change(screen.getByLabelText(/Sessões/), {
      target: { value: sessions },
    });
  }
  fireEvent.change(screen.getByLabelText(/Preço total/), {
    target: { value: '1000' },
  });
};

const submitPackage = () =>
  fireEvent.click(
    screen.getByText('Vender pacote', { selector: 'button[type=submit]' }),
  );

/** Preenche o modal de nova fatura: paciente, descrição e valor. */
const fillInvoice = async () => {
  fireEvent.click(screen.getByText('+ Nova fatura'));
  await pickPatient('Maria Souza');
  fireEvent.change(screen.getByLabelText(/Descrição/), {
    target: { value: 'Sessão avulsa' },
  });
  fireEvent.change(screen.getByLabelText(/Valor/), {
    target: { value: '150' },
  });
};

describe('Feature: Faturamento', () => {
  describe('Cenário: carregamento e listagem', () => {
    it('Dado que a lista ainda não chegou, Quando o servidor responde, Então o grupo exibe o indicador de carregamento', () => {
      // A espera é do `loading.tsx` do grupo (ADR-074 § 6), não mais do cliente.
      renderWithToast(<Loading />);

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
    });

    it('Dado nenhuma fatura, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      mockBillingData();

      await renderBilling();

      expect(
        await screen.findByText('Nenhuma fatura encontrada.'),
      ).toBeInTheDocument();
    });

    it('Dado faturas pendentes e pagas, Quando a página carrega, Então lista dados e calcula totais', async () => {
      mockBillingData({
        invoices: [invoicePending, invoicePaid],
        summary: { paidCents: 20000, pendingCents: 15000 },
      });

      await renderBilling();

      expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
      expect(screen.getByText('João Lima')).toBeInTheDocument();
      expect(screen.getAllByText('R$ 150,00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('R$ 200,00').length).toBeGreaterThan(0);
      expect(screen.getByText(/via Pix em 16\/06\/2026/)).toBeInTheDocument();
    });

    it('Dado erro ao carregar faturas, Quando a página carrega, Então exibe alerta de erro', async () => {
      mockBillingData({ invoicesError: 'Erro ao carregar faturas' });

      await renderBilling();

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('Dado fatura com status desconhecido, Quando renderizada, Então exibe o status bruto como rótulo', async () => {
      const invoiceUnknownStatus: InvoiceDto = {
        ...invoicePending,
        id: 'inv-3',
        patientName: 'Ana Ramos',
        status: 'refunded',
      };
      mockBillingData({ invoices: [invoiceUnknownStatus] });

      await renderBilling();

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
      mockBillingData({ invoices: [invoiceUnknownPayment] });

      await renderBilling();

      expect(await screen.findByText('Carla Nunes')).toBeInTheDocument();
      expect(screen.getByText('boleto')).toBeInTheDocument();
    });
  });

  describe('Cenário: filtros de status', () => {
    it('Dado clique no filtro Pendentes, Quando acionado, Então refaz a busca com status=pending', async () => {
      mockBillingData({ invoices: [invoicePending] });

      await renderBilling();
      await screen.findByText('Maria Souza');

      // O filtro é navegação: o link leva ao servidor com `?status=pending`.
      expect(screen.getByText('Pendentes').closest('a')).toHaveAttribute(
        'href',
        '/faturamento?status=pending',
      );

      cleanup();
      await renderBilling('pending');

      await waitFor(() => {
        expect(billing.listInvoicesFor).toHaveBeenLastCalledWith(
          expect.anything(),
          { status: 'pending' },
        );
      });
    });

    it('Dado os filtros de status, Quando renderizar, Então formam um role=group com o ativo marcado (FAT-01)', async () => {
      mockBillingData({ invoices: [invoicePending] });

      await renderBilling();
      await screen.findByText('Maria Souza');

      expect(
        screen.getByRole('group', { name: 'Filtrar por situação' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Todas')).toHaveAttribute('aria-current', 'page');
      expect(screen.getByText('Pendentes')).not.toHaveAttribute('aria-current');

      cleanup();
      await renderBilling('pending');

      expect(await screen.findByText('Pendentes')).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByText('Todas')).not.toHaveAttribute('aria-current');
    });
  });

  describe('Cenário: alinhamento e ações (FAT-01/03)', () => {
    it('Dado a coluna Valor, Quando renderizar, Então usa text-right e tabular-nums', async () => {
      mockBillingData({ invoices: [invoicePending] });

      await renderBilling();

      const valueCell = await screen.findAllByText('R$ 150,00');
      const cell = valueCell
        .map((el) => el.closest('td'))
        .find((td) => td?.getAttribute('data-label') === 'Valor');
      expect(cell).toHaveClass('text-right', 'tabular-nums');
    });

    it('Dado fatura paga, Quando renderizar a linha, Então a coluna Ações mostra um traço em vez de vazio (FAT-03)', async () => {
      mockBillingData({ invoices: [invoicePaid] });

      await renderBilling();
      await screen.findByText('João Lima');

      const row = screen.getByText('João Lima').closest('tr');
      expect(row).toHaveTextContent('—');
      expect(row?.querySelector('button')).toBeNull();
    });
  });

  describe('Cenário: registrar pagamento', () => {
    it('Dado clique em Receber e escolha do método, Quando confirmado, Então envia a ação pay (a ação atualiza a lista)', async () => {
      mockBillingData({ invoices: [invoicePending] });
      billing.updateInvoice.mockResolvedValue(
        actionOk({ ...invoicePending, status: 'paid' }),
      );

      await renderBilling();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Receber'));
      expect(
        await screen.findByText('Registrar pagamento'),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByText('Pix'));
      fireEvent.click(screen.getByText('Confirmar recebimento'));

      await waitFor(() => {
        expect(billing.updateInvoice).toHaveBeenCalledWith({
          id: 'inv-1',
          change: { action: 'pay', method: 'pix' },
        });
      });
    });

    it('Dado falha ao registrar pagamento, Quando confirmado, Então exibe alerta de erro', async () => {
      mockBillingData({ invoices: [invoicePending] });
      billing.updateInvoice.mockResolvedValue(
        actionError('Erro ao registrar pagamento'),
      );

      await renderBilling();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Receber'));
      fireEvent.click(await screen.findByText('Dinheiro'));
      fireEvent.click(screen.getByText('Confirmar recebimento'));

      expect(
        await screen.findByText('Erro ao registrar pagamento'),
      ).toBeInTheDocument();
    });

    it('Dado clique em Fechar no modal de pagamento, Quando acionado, Então fecha sem registrar pagamento', async () => {
      mockBillingData({ invoices: [invoicePending] });

      await renderBilling();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Receber'));
      expect(
        await screen.findByText('Registrar pagamento'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByText('Registrar pagamento')).not.toBeInTheDocument();
      expect(billing.updateInvoice).not.toHaveBeenCalled();
    });

    it("Dado sucesso ao registrar pagamento, Quando confirmado, Então exibe toast de sucesso 'Pagamento registrado'", async () => {
      mockBillingData({ invoices: [invoicePending] });
      billing.updateInvoice.mockResolvedValue(
        actionOk({ ...invoicePending, status: 'paid' }),
      );

      await renderBilling();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Receber'));
      fireEvent.click(await screen.findByText('Pix'));
      fireEvent.click(screen.getByText('Confirmar recebimento'));

      await waitFor(() => {
        expect(screen.getByText('Pagamento registrado')).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: cancelar fatura', () => {
    it('Dado clique em Cancelar, Quando acionado, Então envia a ação cancel (a ação atualiza a lista)', async () => {
      mockBillingData({ invoices: [invoicePending] });
      billing.updateInvoice.mockResolvedValue(
        actionOk({ ...invoicePending, status: 'cancelled' }),
      );

      await renderBilling();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Cancelar fatura'));

      await waitFor(() => {
        expect(billing.updateInvoice).toHaveBeenCalledWith({
          id: 'inv-1',
          change: { action: 'cancel' },
        });
      });
    });

    it('Dado falha ao cancelar, Quando acionado, Então exibe alerta de erro', async () => {
      mockBillingData({ invoices: [invoicePending] });
      billing.updateInvoice.mockResolvedValue(
        actionError('Erro ao cancelar fatura'),
      );

      await renderBilling();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Cancelar fatura'));

      expect(
        await screen.findByText('Erro ao cancelar fatura'),
      ).toBeInTheDocument();
    });

    it("Dado sucesso ao cancelar, Quando acionado, Então exibe toast de sucesso 'Fatura cancelada'", async () => {
      mockBillingData({ invoices: [invoicePending] });
      billing.updateInvoice.mockResolvedValue(
        actionOk({ ...invoicePending, status: 'cancelled' }),
      );

      await renderBilling();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Cancelar fatura'));

      await waitFor(() => {
        expect(screen.getByText('Fatura cancelada')).toBeInTheDocument();
      });
    });

    it('Dado clique em Cancelar seguido de cancelamento no dialog, Quando acionado, Então não chama a ação', async () => {
      mockBillingData({ invoices: [invoicePending] });

      await renderBilling();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Cancelar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(billing.updateInvoice).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: emitir nova fatura', () => {
    it('Dado preenchimento do formulário, Quando submetido, Então cria a fatura e fecha o modal', async () => {
      mockBillingData();
      patientsFetch([patientFixture]);
      billing.createInvoice.mockResolvedValue(actionOk(invoicePending));

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      await fillInvoice();
      fireEvent.click(screen.getByText('Emitir fatura'));

      await waitFor(() =>
        expect(screen.queryByText('Emitir fatura')).not.toBeInTheDocument(),
      );
      expect(billing.createInvoice).toHaveBeenCalledTimes(1);
    });

    it('Dado falha ao emitir fatura, Quando submetido, Então exibe alerta de erro no formulário', async () => {
      mockBillingData();
      patientsFetch([patientFixture]);
      billing.createInvoice.mockResolvedValue(
        actionError('Erro ao emitir fatura: dados inválidos'),
      );

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      await fillInvoice();
      fireEvent.click(screen.getByText('Emitir fatura'));

      expect(
        await screen.findByText('Erro ao emitir fatura: dados inválidos'),
      ).toBeInTheDocument();
      expect(screen.getByText('Emitir fatura')).toBeInTheDocument();
    });

    it('Dado preenchimento com vencimento, Quando submetido, Então envia dueDate convertido para ISO', async () => {
      mockBillingData();
      patientsFetch([patientFixture]);
      billing.createInvoice.mockResolvedValue(actionOk(invoicePending));

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      await fillInvoice();
      fireEvent.change(screen.getByLabelText(/Vencimento/), {
        target: { value: '2026-08-01' },
      });
      fireEvent.click(screen.getByText('Emitir fatura'));

      await waitFor(() => {
        expect(billing.createInvoice).toHaveBeenCalledWith({
          patientId: 'pat-1',
          description: 'Sessão avulsa',
          amountCents: 15000,
          dueDate: new Date('2026-08-01').toISOString(),
        });
      });
    });

    it('Dado clique em Fechar no modal de nova fatura, Quando acionado, Então fecha sem criar fatura', async () => {
      mockBillingData();
      patientsFetch([patientFixture]);

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('+ Nova fatura'));
      expect(await screen.findByText('Emitir fatura')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByText('Emitir fatura')).not.toBeInTheDocument();
      expect(billing.createInvoice).not.toHaveBeenCalled();
    });

    it('Dado modal de nova fatura aberto, Quando nada foi buscado, Então não carrega a lista de pacientes (#197)', async () => {
      mockBillingData();
      const fetchMock = patientsFetch();

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('+ Nova fatura'));

      expect(await screen.findByLabelText(/Paciente/)).toHaveValue('');
      expect(screen.getByText(/Digite ao menos 2 letras/)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Dado sucesso ao emitir fatura, Quando submetido, Então exibe toast de sucesso 'Fatura criada'", async () => {
      mockBillingData();
      patientsFetch([patientFixture]);
      billing.createInvoice.mockResolvedValue(actionOk(invoicePending));

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      await fillInvoice();
      fireEvent.click(screen.getByText('Emitir fatura'));

      await waitFor(() => {
        expect(screen.getByText('Fatura criada')).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: vender pacote de sessões', () => {
    it('Dado clique em Vender pacote e preenchimento, Quando submetido, Então cria o pacote', async () => {
      mockBillingData({ procedures: [procedureFixture] });
      patientsFetch([patientFixture]);
      billing.sellPackage.mockResolvedValue(actionOk({ id: 'pkg-1' }));

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      await fillPackage();
      submitPackage();

      await waitFor(() =>
        expect(billing.sellPackage).toHaveBeenCalledWith(PACKAGE_FORM),
      );
    });

    it("Dado sucesso ao vender pacote, Quando submetido, Então exibe toast de sucesso 'Pacote vendido'", async () => {
      mockBillingData({ procedures: [procedureFixture] });
      patientsFetch([patientFixture]);
      billing.sellPackage.mockResolvedValue(actionOk({ id: 'pkg-1' }));

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      await fillPackage();
      submitPackage();

      await waitFor(() => {
        expect(screen.getByText('Pacote vendido')).toBeInTheDocument();
      });
    });

    it('Dado nenhum procedimento ativo, Quando o modal de venda abre, Então exibe aviso para cadastrar catálogo', async () => {
      mockBillingData({ procedures: [] });
      patientsFetch([patientFixture]);

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('Vender pacote'));

      expect(
        await screen.findByText(
          'Cadastre procedimentos no catálogo para vender pacotes.',
        ),
      ).toBeInTheDocument();
    });

    it('Dado falha ao vender pacote, Quando submetido, Então exibe alerta de erro no formulário', async () => {
      mockBillingData({ procedures: [procedureFixture] });
      patientsFetch([patientFixture]);
      billing.sellPackage.mockResolvedValue(
        actionError('Erro ao vender pacote'),
      );

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      await fillPackage();
      submitPackage();

      expect(
        await screen.findByText('Erro ao vender pacote'),
      ).toBeInTheDocument();
    });

    it('Dado alteração da quantidade de sessões, Quando submetido, Então envia totalSessions atualizado', async () => {
      mockBillingData({ procedures: [procedureFixture] });
      patientsFetch([patientFixture]);
      billing.sellPackage.mockResolvedValue(actionOk({ id: 'pkg-1' }));

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      await fillPackage('5');
      submitPackage();

      await waitFor(() => {
        expect(billing.sellPackage).toHaveBeenCalledWith({
          ...PACKAGE_FORM,
          totalSessions: 5,
        });
      });
    });

    it('Dado validade preenchida, Quando vender pacote, Então envia expiresAt no fim do dia (COMP3-07)', async () => {
      mockBillingData({ procedures: [procedureFixture] });
      patientsFetch([patientFixture]);
      billing.sellPackage.mockResolvedValue(actionOk({ id: 'pkg-2' }));

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      await fillPackage('5');
      fireEvent.change(screen.getByLabelText(/Validade/), {
        target: { value: '2030-06-30' },
      });
      submitPackage();

      await waitFor(() => {
        expect(billing.sellPackage).toHaveBeenCalledWith({
          ...PACKAGE_FORM,
          totalSessions: 5,
          expiresAt: '2030-06-30T23:59:59.000Z',
        });
      });
    });

    it('Dado clique em Fechar no modal de venda de pacote, Quando acionado, Então fecha sem criar pacote', async () => {
      mockBillingData({ procedures: [procedureFixture] });
      patientsFetch([patientFixture]);

      await renderBilling();
      await screen.findByText('Nenhuma fatura encontrada.');

      fireEvent.click(screen.getByText('Vender pacote'));
      expect(
        await screen.findByText('Vender pacote de sessões'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(
        screen.queryByText('Vender pacote de sessões'),
      ).not.toBeInTheDocument();
      expect(billing.sellPackage).not.toHaveBeenCalled();
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
      mockBillingData({ invoices: fullPage, nextCursor: cursor });
      const fetchMock = mockFetch(({ url }) =>
        url.includes(`cursor=${cursor}`)
          ? jsonResponse([])
          : jsonResponse(null, false),
      );

      await renderBilling();
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
