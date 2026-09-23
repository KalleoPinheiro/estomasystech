// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PayoutsPage from '@/app/(staff)/repasses/page';
import type {
  CommissionPayoutDto,
  PayoutStatementDto,
  PayoutsResponseDto,
} from '@/lib/dto';
import { renderWithToast } from '../support/render-with-toast';

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: async () => ({ success: ok, data, error: ok ? null : 'Erro' }),
});

type Router = (
  url: string,
  init?: RequestInit,
) => { ok: boolean; json: () => Promise<unknown> };

/** A tela primeiro lê a identidade para escolher a visão (clínica × própria). */
const identity = (role: string) =>
  jsonResponse({
    clinicLabel: 'Clínica',
    account: { email: `${role}@clinica.com`, role, roleLabel: role },
  });

const mockFetch = (router: Router, role = 'company_admin') => {
  const fn = vi.fn(async (url: string, init?: RequestInit) =>
    url === '/api/auth/identity' ? identity(role) : router(url, init),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const item = {
  appointmentId: 'a1',
  kind: 'session' as const,
  procedure: 'Curativo',
  sessionDate: '2026-09-10T12:00:00.000Z',
  baseCents: 15000,
  commissionCents: 6000,
};

const anaRow: PayoutStatementDto = {
  professionalId: 'pr-ana',
  professionalName: 'Dra. Ana',
  active: true,
  rule: { kind: 'percentage', pct: 40 },
  payableCents: 6000,
  pendingCents: 3000,
  payable: [item],
  pending: [],
  closedPayout: null,
};

const closed: CommissionPayoutDto = {
  id: 'po-1',
  professionalId: 'pr-caio',
  professionalName: 'Dr. Caio',
  period: '2026-08',
  totalCents: 10000,
  paidAt: '2026-09-05T12:00:00.000Z',
  paymentMethod: 'pix',
  notes: null,
  createdBy: 'admin@clinica.com',
  createdAt: '2026-09-05T12:00:00.000Z',
  items: [item],
  rule: { kind: 'percentage', pct: 40 },
  status: 'active',
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
};

const caioRow: PayoutStatementDto = {
  ...anaRow,
  professionalId: 'pr-caio',
  professionalName: 'Dr. Caio',
  rule: { kind: 'fixed', centsPerSession: 5000 },
  payableCents: 0,
  payable: [],
  closedPayout: closed,
};

const clinicResponse: PayoutsResponseDto = {
  scope: 'clinic',
  period: '2020-01',
  rows: [anaRow, caioRow],
  history: [closed],
};

describe('Feature: Tela de repasses', () => {
  it('Dado Admin, Quando abre a tela, Então lista profissionais com regra, saldo, situação e histórico', async () => {
    mockFetch(() => jsonResponse(clinicResponse));

    renderWithToast(<PayoutsPage />);

    expect(await screen.findByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('40% da sessão')).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00 por sessão')).toBeInTheDocument();
    expect(screen.getByText('Aberto')).toBeInTheDocument();
    expect(screen.getByText('Pago em 05/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Repasses registrados')).toBeInTheDocument();
    expect(screen.getByText('1 sessões')).toBeInTheDocument();
  });

  it('Dado Admin, Quando registra o repasse do mês encerrado, Então envia o fechamento e recarrega', async () => {
    let posted: Record<string, unknown> | undefined;
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/commission-payouts' && init?.method === 'POST') {
        posted = JSON.parse(String(init.body));
        return jsonResponse({ ...closed, id: 'po-2' });
      }
      return jsonResponse(clinicResponse);
    });

    renderWithToast(<PayoutsPage />);
    fireEvent.click(await screen.findByText('Registrar repasse'));
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), {
      target: { value: 'transfer' },
    });
    fireEvent.click(screen.getByText('Confirmar repasse'));

    await waitFor(() => {
      expect(posted).toMatchObject({
        professionalId: 'pr-ana',
        paymentMethod: 'transfer',
      });
    });
    expect(await screen.findByText('Repasse registrado')).toBeInTheDocument();
    const gets = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).startsWith('/api/commission-payouts?') && !init?.method,
    );
    expect(gets.length).toBeGreaterThanOrEqual(2);
  });

  it('Dado o mês corrente, Quando navega até ele, Então o fechamento fica indisponível', async () => {
    mockFetch(() => jsonResponse(clinicResponse));

    renderWithToast(<PayoutsPage />);
    await screen.findByText('Dra. Ana');
    fireEvent.click(screen.getByLabelText('Próximo mês'));

    expect(
      await screen.findByText(
        'O fechamento fica disponível depois que o mês terminar.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Registrar repasse')).toBeDisabled();
  });

  it('Dado Profissional, Quando abre a tela, Então pede o próprio extrato e vê a regra, sem ações de registro', async () => {
    const fetchMock = mockFetch(
      () =>
        jsonResponse({
          scope: 'own',
          period: '2020-01',
          rows: [anaRow],
          history: [],
        } satisfies PayoutsResponseDto),
      'profissional',
    );

    renderWithToast(<PayoutsPage />);

    expect(await screen.findByText('Meus repasses')).toBeInTheDocument();
    expect(screen.getByText('R$ 60,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument();
    expect(screen.getByText('40% da sessão')).toBeInTheDocument();
    expect(screen.queryByText('Registrar repasse')).not.toBeInTheDocument();
    expect(
      screen.getByText('Nenhum repasse registrado ainda.'),
    ).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.startsWith('/api/my-payouts?'))).toBe(true);
    expect(urls.some((u) => u.startsWith('/api/commission-payouts'))).toBe(
      false,
    );
  });

  it('Dado repasse já recebido pelo Profissional, Quando abre a tela, Então mostra o valor recebido e a data', async () => {
    mockFetch(
      () =>
        jsonResponse({
          scope: 'own',
          period: '2020-01',
          rows: [caioRow],
          history: [closed],
        } satisfies PayoutsResponseDto),
      'profissional',
    );

    renderWithToast(<PayoutsPage />);

    expect(
      await screen.findByText(/Recebido pelo fechamento/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Ver sessões')[0]);
    expect(await screen.findByText('Curativo')).toBeInTheDocument();
  });

  it('Dada falha da API, Quando abre a tela, Então mostra o erro', async () => {
    mockFetch(() => ({
      ok: false,
      json: async () => ({
        success: false,
        data: null,
        error: 'Sem permissão para ver repasses',
      }),
    }));

    renderWithToast(<PayoutsPage />);

    expect(
      await screen.findByText('Sem permissão para ver repasses'),
    ).toBeInTheDocument();
  });

  describe('Cancelar repasse e comprovante', () => {
    const older: CommissionPayoutDto = {
      ...closed,
      id: 'po-0',
      period: '2026-07',
    };
    const voided: CommissionPayoutDto = {
      ...closed,
      id: 'po-x',
      period: '2026-06',
      status: 'cancelled',
      cancelledAt: '2026-09-06T12:00:00.000Z',
      cancelledBy: 'admin@clinica.com',
      cancelReason: 'valor errado',
    };
    const withHistory: PayoutsResponseDto = {
      ...clinicResponse,
      history: [closed, older, voided],
    };

    it('Dado histórico, Então mostra situação, comprovante e Cancelar só no mais recente ativo', async () => {
      mockFetch(() => jsonResponse(withHistory));

      renderWithToast(<PayoutsPage />);

      expect(await screen.findByText('Cancelado')).toBeInTheDocument();
      expect(screen.getByText('valor errado')).toBeInTheDocument();
      expect(screen.getAllByText('Pago')).toHaveLength(2);
      expect(screen.getAllByText('Cancelar')).toHaveLength(1);
      const links = screen
        .getAllByText('Comprovante')
        .map((a) => a.closest('a')?.getAttribute('href'));
      expect(links).toEqual([
        '/documentos/repasse/po-1',
        '/documentos/repasse/po-0',
        '/documentos/repasse/po-x',
      ]);
    });

    it('Dado Admin, Quando cancela com motivo, Então envia o motivo e recarrega', async () => {
      let posted: { url: string; body: unknown } | undefined;
      mockFetch((url, init) => {
        if (init?.method === 'POST') {
          posted = { url, body: JSON.parse(String(init.body)) };
          return jsonResponse({ ...closed, status: 'cancelled' });
        }
        return jsonResponse(withHistory);
      });

      renderWithToast(<PayoutsPage />);
      fireEvent.click(await screen.findByText('Cancelar'));
      fireEvent.change(screen.getByLabelText(/Motivo do cancelamento/), {
        target: { value: 'registrado em dobro' },
      });
      fireEvent.click(screen.getByText('Confirmar cancelamento'));

      await waitFor(() => {
        expect(posted).toEqual({
          url: '/api/commission-payouts/po-1/cancel',
          body: { reason: 'registrado em dobro' },
        });
      });
      expect(await screen.findByText('Repasse cancelado')).toBeInTheDocument();
    });

    it('Dada recusa da API ao cancelar, Então mostra o erro no formulário', async () => {
      mockFetch((_url, init) =>
        init?.method === 'POST'
          ? {
              ok: false,
              json: async () => ({
                success: false,
                data: null,
                error: 'Só o repasse mais recente pode ser cancelado',
              }),
            }
          : jsonResponse(withHistory),
      );

      renderWithToast(<PayoutsPage />);
      fireEvent.click(await screen.findByText('Cancelar'));
      fireEvent.change(screen.getByLabelText(/Motivo do cancelamento/), {
        target: { value: 'registrado em dobro' },
      });
      fireEvent.click(screen.getByText('Confirmar cancelamento'));

      expect(
        await screen.findByText('Só o repasse mais recente pode ser cancelado'),
      ).toBeInTheDocument();
    });

    it('Dado Profissional, Então vê o comprovante mas não o Cancelar', async () => {
      mockFetch(
        () =>
          jsonResponse({
            scope: 'own',
            period: '2020-01',
            rows: [caioRow],
            history: [closed],
          } satisfies PayoutsResponseDto),
        'profissional',
      );

      renderWithToast(<PayoutsPage />);

      expect(await screen.findByText('Comprovante')).toBeInTheDocument();
      expect(screen.queryByText('Cancelar')).not.toBeInTheDocument();
    });
  });
});
