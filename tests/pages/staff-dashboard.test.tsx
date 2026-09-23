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
import DashboardPage from '@/app/(staff)/page';
import type { AppointmentDto, FollowUpDto, SupplyDto } from '@/lib/dto';
import { formatDate } from '@/lib/format';

interface TriagePhotoFixture {
  id: string;
  conditionTitle: string;
  patientId: string | null;
  patientName: string;
  patientNote: string | null;
  createdAt: string;
  waitingHours: number;
  latestScore: { kind: 'push' | 'det'; value: number } | null;
}

const summaryFixture = {
  billing: { paidCents: 150000, pendingCents: 50000, pendingCount: 3 },
  appointmentsInMonth: 12,
  today: [] as AppointmentDto[],
};

const appointmentFixture: AppointmentDto = {
  id: 'appt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: '2026-07-19T12:00:00.000Z',
  endsAt: '2026-07-19T13:00:00.000Z',
  procedure: 'Troca de bolsa',
  priceCents: 12000,
  notes: null,
  status: 'scheduled',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
};

const followUpFixture: FollowUpDto = {
  id: 'fu-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  appointmentId: null,
  dueDate: '2026-07-20T00:00:00.000Z',
  reason: 'Retorno: avaliação de ferida',
  status: 'pending',
  isOverdue: true,
};

const supplyFixture: SupplyDto = {
  id: 'sup-1',
  name: 'Bolsa de colostomia',
  unit: 'un',
  minQty: 10,
  priceCents: 3000,
  stockQty: 2,
  isLowStock: true,
  isOutOfStock: false,
  active: true,
};

const triageFixture: TriagePhotoFixture = {
  id: 'photo-1',
  conditionTitle: 'Ferida perna E',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  patientNote: 'Está coçando',
  createdAt: '2026-07-18T10:00:00.000Z',
  waitingHours: 2,
  latestScore: null,
};

interface FetchOptions {
  summary?: unknown;
  summaryError?: string;
  followUps?: FollowUpDto[];
  followUpsError?: string;
  supplies?: SupplyDto[];
  suppliesError?: string;
  triage?: TriagePhotoFixture[];
  triageError?: string;
}

function jsonResponse(
  success: boolean,
  data: unknown,
  error: string | null = null,
) {
  return {
    ok: success,
    json: async () => ({ success, data, error }),
  };
}

function mockFetch(options: FetchOptions = {}) {
  const {
    summary = summaryFixture,
    summaryError,
    followUps = [],
    followUpsError,
    supplies = [],
    suppliesError,
    triage = [],
    triageError,
  } = options;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url.startsWith('/api/summary')) {
        return summaryError
          ? jsonResponse(false, null, summaryError)
          : jsonResponse(true, summary);
      }
      if (url.startsWith('/api/follow-ups') && method === 'GET') {
        return followUpsError
          ? jsonResponse(false, null, followUpsError)
          : jsonResponse(true, followUps);
      }
      if (url.startsWith('/api/follow-ups/') && method === 'PATCH') {
        return jsonResponse(true, { ...followUpFixture, status: 'done' });
      }
      if (url.startsWith('/api/supplies')) {
        return suppliesError
          ? jsonResponse(false, null, suppliesError)
          : jsonResponse(true, supplies);
      }
      if (url.startsWith('/api/photos/triage')) {
        return triageError
          ? jsonResponse(false, null, triageError)
          : jsonResponse(true, triage);
      }
      if (url.startsWith('/api/photos/') && method === 'PATCH') {
        return jsonResponse(true, { ok: true });
      }
      throw new Error(`URL não mapeada no mock: ${method} ${url}`);
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Dashboard do painel interno', () => {
  describe('Cenário: carregando', () => {
    it('Dado que o resumo ainda não chegou, Quando renderizar, Então exibe indicador de carregamento', () => {
      mockFetch();
      renderWithToast(<DashboardPage />);

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
    });
  });

  describe('Cenário: erro ao carregar resumo', () => {
    it('Dado falha na API de resumo, Quando renderizar, Então exibe alerta de erro', async () => {
      mockFetch({ summaryError: 'Erro ao buscar resumo' });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Erro ao buscar resumo')).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: resumo carregado com dados', () => {
    it('Dado resumo, consultas do dia, retornos e estoque, Quando renderizar, Então exibe os cartões e listas', async () => {
      mockFetch({
        summary: { ...summaryFixture, today: [appointmentFixture] },
        followUps: [followUpFixture],
        supplies: [supplyFixture],
      });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('R$ 1.500,00')).toBeInTheDocument();
      });
      expect(screen.getByText('R$ 500,00')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0);
      expect(screen.getByText('Troca de bolsa')).toBeInTheDocument();

      expect(screen.getByText(/Atrasado/)).toBeInTheDocument();
      expect(screen.getByText('Bolsa de colostomia')).toBeInTheDocument();
      expect(screen.getByText('2/10 un')).toBeInTheDocument();
    });

    it('Dado status de consulta sem rótulo mapeado, Quando renderizar, Então usa o status bruto como rótulo', async () => {
      mockFetch({
        summary: {
          ...summaryFixture,
          today: [{ ...appointmentFixture, status: 'rescheduled' }],
        },
      });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('rescheduled')).toBeInTheDocument();
      });
    });

    it('Dado retorno não atrasado, Quando renderizar, Então não exibe o marcador de atraso', async () => {
      mockFetch({
        followUps: [{ ...followUpFixture, isOverdue: false }],
      });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(
          screen.getByText(formatDate(followUpFixture.dueDate)),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/Atrasado/)).not.toBeInTheDocument();
    });
  });

  describe('Cenário: listas vazias', () => {
    it('Dado nenhuma consulta hoje, nenhum retorno e nenhum insumo baixo, Quando renderizar, Então exibe mensagens de estado vazio', async () => {
      mockFetch();
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Nenhuma consulta agendada para hoje.'),
        ).toBeInTheDocument();
      });
      expect(screen.getByText('Nenhum retorno pendente.')).toBeInTheDocument();
      expect(
        screen.getByText('Nenhum insumo abaixo do mínimo.'),
      ).toBeInTheDocument();
    });

    it('Dado insumos existentes mas nenhum abaixo do mínimo, Quando renderizar, Então filtra a lista de estoque baixo', async () => {
      mockFetch({ supplies: [{ ...supplyFixture, isLowStock: false }] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Nenhum insumo abaixo do mínimo.'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: ações de retorno pendente', () => {
    it('Dado clique em Concluir, Quando acionado, Então chama PATCH e atualiza a lista', async () => {
      mockFetch({ followUps: [followUpFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Concluir')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Concluir'));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/follow-ups/fu-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'done' }),
          }),
        );
      });
    });

    it('Dado clique em Cancelar, Quando acionado, Então chama PATCH com status cancelled', async () => {
      mockFetch({ followUps: [followUpFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Cancelar')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Cancelar retorno'));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/follow-ups/fu-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'cancelled' }),
          }),
        );
      });
    });

    it('Dado clique em Cancelar seguido de cancelamento no dialog, Quando acionado, Então não chama a API', async () => {
      mockFetch({ followUps: [followUpFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Cancelar')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Cancelar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      const fetchMock = fetch as ReturnType<
        typeof vi.fn<
          (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>
        >
      >;
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
      ).toBe(false);
    });

    it("Dado clique em Concluir com sucesso, Quando executado, Então exibe toast de sucesso 'Retorno concluído'", async () => {
      mockFetch({ followUps: [followUpFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Concluir')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Concluir'));

      await waitFor(() => {
        expect(screen.getByText('Retorno concluído')).toBeInTheDocument();
      });
    });

    it("Dado clique em Cancelar com sucesso, Quando executado, Então exibe toast de sucesso 'Retorno cancelado'", async () => {
      mockFetch({ followUps: [followUpFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Cancelar')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Cancelar retorno'));

      await waitFor(() => {
        expect(screen.getByText('Retorno cancelado')).toBeInTheDocument();
      });
    });

    it('Dado falha ao concluir retorno, Quando acionado, Então exibe toast de erro', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (url.startsWith('/api/summary'))
            return jsonResponse(true, summaryFixture);
          if (url.startsWith('/api/follow-ups') && method === 'GET')
            return jsonResponse(true, [followUpFixture]);
          if (url.startsWith('/api/follow-ups/') && method === 'PATCH') {
            throw new Error('Erro ao atualizar retorno');
          }
          if (url.startsWith('/api/supplies')) return jsonResponse(true, []);
          if (url.startsWith('/api/photos/triage'))
            return jsonResponse(true, []);
          throw new Error(`URL não mapeada: ${method} ${url}`);
        }),
      );
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Concluir')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Concluir'));

      await waitFor(() => {
        expect(
          screen.getByText('Erro ao atualizar retorno'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: erro de API por card (DASH-01)', () => {
    it('Dado falha na API de retornos, Quando renderizar, Então mostra ErrorAlert no card em vez de lista vazia', async () => {
      mockFetch({ followUpsError: 'Erro ao buscar retornos' });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Erro ao buscar retornos')).toBeInTheDocument();
      });
      expect(
        screen.queryByText('Nenhum retorno pendente.'),
      ).not.toBeInTheDocument();
    });

    it('Dado falha na API de estoque, Quando renderizar, Então mostra ErrorAlert no card em vez de lista vazia', async () => {
      mockFetch({ suppliesError: 'Erro ao buscar estoque' });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Erro ao buscar estoque')).toBeInTheDocument();
      });
      expect(
        screen.queryByText('Nenhum insumo abaixo do mínimo.'),
      ).not.toBeInTheDocument();
    });

    it('Dado retornos e estoque falhando ao mesmo tempo, Quando renderizar, Então cada card mostra seu próprio erro isolado', async () => {
      mockFetch({
        followUpsError: 'Erro retornos',
        suppliesError: 'Erro estoque',
      });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Erro retornos')).toBeInTheDocument();
      });
      expect(screen.getByText('Erro estoque')).toBeInTheDocument();
    });

    it("Dado erro no card de retornos, Quando clicar em 'Tentar novamente', Então refaz a busca", async () => {
      mockFetch({ followUpsError: 'Erro ao buscar retornos' });
      renderWithToast(<DashboardPage />);

      await screen.findByText('Erro ao buscar retornos');
      const callsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      await waitFor(() => {
        expect(
          (fetch as ReturnType<typeof vi.fn>).mock.calls.length,
        ).toBeGreaterThan(callsBefore);
      });
    });
  });

  describe('Cenário: fila de triagem em faixa própria (DASH-02)', () => {
    it('Dado fila de triagem não-vazia, Quando renderizar, Então o heading da fila vem antes do heading de retornos pendentes', async () => {
      mockFetch({ triage: [triageFixture], followUps: [followUpFixture] });
      renderWithToast(<DashboardPage />);

      await screen.findByText(/aguardando triagem/);
      const headings = screen.getAllByRole('heading');
      const triageIndex = headings.findIndex((h) =>
        /aguardando triagem/.test(h.textContent ?? ''),
      );
      const followUpsIndex = headings.findIndex(
        (h) => h.textContent === 'Retornos pendentes',
      );

      expect(triageIndex).toBeGreaterThanOrEqual(0);
      expect(followUpsIndex).toBeGreaterThan(triageIndex);
    });
  });

  describe('Cenário: KPIs navegáveis e título compacto (DASH-04/06)', () => {
    it('Dado o dashboard carregado, Quando renderizar, Então cada KPI é um link com aria-label descritivo', async () => {
      mockFetch();
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('link', { name: 'Ver recebido no mês' }),
        ).toHaveAttribute('href', '/faturamento');
      });
      expect(
        screen.getByRole('link', { name: 'Ver consultas no mês' }),
      ).toHaveAttribute('href', '/agenda');
    });

    it('Dado o dashboard carregado, Quando renderizar, Então o título é um h1 compacto sem Hero de landing page', async () => {
      mockFetch();
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'Dashboard' }),
        ).toBeInTheDocument();
      });
      expect(
        document.querySelector('.sv-hero__eyebrow'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cenário: fila de triagem de fotos', () => {
    it('Dado fila vazia, Quando renderizar, Então não exibe a seção de triagem', async () => {
      mockFetch();
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Nenhum retorno pendente.'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/aguardando triagem/)).not.toBeInTheDocument();
    });

    it('Dado fotos aguardando triagem, Quando renderizar, Então exibe a fila com paciente e observação', async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/aguardando triagem \(1\)/),
        ).toBeInTheDocument();
      });
      expect(screen.getAllByText(/Maria Souza/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Está coçando/)).toBeInTheDocument();
    });

    it('Dado pendência antiga e score da condição, Quando renderizar, Então mostra idade destacada e badge do score (COMP3-04/06)', async () => {
      mockFetch({
        triage: [
          {
            ...triageFixture,
            waitingHours: 30,
            latestScore: { kind: 'push', value: 9 },
          },
        ],
      });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('PUSH 9')).toBeInTheDocument();
      });
      const waiting = screen.getByText(/aguardando há 30h/);
      // `text-danger` é o token semântico do Still Void (var(--sv-danger-ink)),
      // que substituiu o degrau cru text-red-700 na migração para a v2.
      expect(waiting).toHaveClass('text-danger');
    });

    it('Dado score de triagem, Quando focar o selo via teclado, Então mostra a legenda no tooltip', async () => {
      mockFetch({
        triage: [
          {
            ...triageFixture,
            waitingHours: 30,
            latestScore: { kind: 'push', value: 9 },
          },
        ],
      });
      renderWithToast(<DashboardPage />);

      const badge = await screen.findByText('PUSH 9');
      badge.focus();

      expect(
        await screen.findByText(/Pressure Ulcer Scale for Healing/),
      ).toBeInTheDocument();
    });

    it('Dado pendência recente sem score, Quando renderizar, Então idade sem destaque e sem badge (COMP3-05)', async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/aguardando há 2h/)).toBeInTheDocument();
      });
      expect(screen.getByText(/aguardando há 2h/)).not.toHaveClass(
        'text-danger',
      );
      expect(screen.queryByText(/PUSH|DET/)).not.toBeInTheDocument();
    });

    it("Dado clique em 'Ok, manter plano', Quando acionado, Então envia triagem reviewed", async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Ok, manter plano'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/photos/photo-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ triage: 'reviewed' }),
          }),
        );
      });
      expect(await screen.findByText('Foto revisada')).toBeInTheDocument();
    });

    it("Dado clique em 'Antecipar retorno', Quando acionado, Então envia triagem escalated", async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Antecipar retorno')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Antecipar retorno'));
      fireEvent.click(await screen.findByText('Confirmar antecipação'));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/photos/photo-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ triage: 'escalated' }),
          }),
        );
      });
      expect(await screen.findByText('Foto escalada')).toBeInTheDocument();
    });

    it("Dado clique em 'Ok, manter plano' seguido de cancelamento, Quando acionado, Então não chama a API", async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Ok, manter plano'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      const fetchMock = fetch as ReturnType<
        typeof vi.fn<
          (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>
        >
      >;
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).startsWith('/api/photos/') && init?.method === 'PATCH',
        ),
      ).toBe(false);
    });

    it("Dado clique em 'Antecipar retorno' seguido de cancelamento, Quando acionado, Então não chama a API", async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Antecipar retorno')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Antecipar retorno'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      const fetchMock = fetch as ReturnType<
        typeof vi.fn<
          (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>
        >
      >;
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).startsWith('/api/photos/') && init?.method === 'PATCH',
        ),
      ).toBe(false);
    });

    it("Dado foto sem observação do paciente, Quando renderizar, Então exibe 'sem observação'", async () => {
      mockFetch({ triage: [{ ...triageFixture, patientNote: null }] });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/sem observação/)).toBeInTheDocument();
      });
    });

    it('Dado erro não padronizado (sem instância de Error) na triagem, Quando acionar decisão, Então exibe mensagem padrão de erro', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (url.startsWith('/api/summary'))
            return jsonResponse(true, summaryFixture);
          if (url.startsWith('/api/follow-ups')) return jsonResponse(true, []);
          if (url.startsWith('/api/supplies')) return jsonResponse(true, []);
          if (url.startsWith('/api/photos/triage'))
            return jsonResponse(true, [triageFixture]);
          if (url.startsWith('/api/photos/') && method === 'PATCH') {
            // Rejeição não padronizada de propósito: o cliente precisa lidar com
            // throw de string, não só de Error.
            throw 'falha inesperada';
          }
          throw new Error(`URL não mapeada: ${method} ${url}`);
        }),
      );
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Ok, manter plano'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(screen.getByText('Erro na triagem')).toBeInTheDocument();
      });
    });

    it('Dado falha na triagem, Quando acionar decisão, Então exibe alerta de erro', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (url.startsWith('/api/summary'))
            return jsonResponse(true, summaryFixture);
          if (url.startsWith('/api/follow-ups')) return jsonResponse(true, []);
          if (url.startsWith('/api/supplies')) return jsonResponse(true, []);
          if (url.startsWith('/api/photos/triage'))
            return jsonResponse(true, [triageFixture]);
          if (url.startsWith('/api/photos/') && method === 'PATCH') {
            return jsonResponse(false, null, 'Erro na triagem');
          }
          throw new Error(`URL não mapeada: ${method} ${url}`);
        }),
      );
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Ok, manter plano'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(screen.getByText('Erro na triagem')).toBeInTheDocument();
      });
    });

    it('Dado falha na API de triagem, Quando renderizar, Então mostra ErrorAlert com opção de retry em vez de esconder a seção', async () => {
      mockFetch({ triageError: 'Erro ao buscar fila de triagem' });
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Erro ao buscar fila de triagem'),
        ).toBeInTheDocument();
      });
      const callsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      await waitFor(() => {
        expect(
          (fetch as ReturnType<typeof vi.fn>).mock.calls.length,
        ).toBeGreaterThan(callsBefore);
      });
    });

    it('Dado fila de triagem carregando, Quando renderizar, Então mostra indicador de carregamento na seção', () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      expect(screen.getAllByText('Carregando…').length).toBeGreaterThan(0);
    });

    it('Dado clique na miniatura da foto, Quando acionado, Então abre a foto ampliada em um modal', async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      const thumbnail = await screen.findByRole('button', {
        name: 'Ampliar foto de Maria Souza',
      });
      fireEvent.click(thumbnail);

      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByRole('heading', { name: 'Foto de Maria Souza' }),
      ).toBeInTheDocument();
    });

    it("Dado botão 'Ok, manter plano', Quando renderizar, Então usa cor de risco (é ação irreversível)", async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      const keepPlanButton = await screen.findByText('Ok, manter plano');
      expect(keepPlanButton).toHaveClass('text-danger');
    });

    it("Dado botão 'Antecipar retorno', Quando renderizar, Então usa cor neutra/positiva (é a ação protetora)", async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      const escalateButton = await screen.findByText('Antecipar retorno');
      expect(escalateButton).toHaveClass('text-success');
    });
  });

  describe('Cenário: cor semântica dos cards de KPI (DASH-06)', () => {
    it('Dado resumo financeiro, Quando renderizar, Então "Recebido no mês" usa tom de sucesso', async () => {
      mockFetch();
      renderWithToast(<DashboardPage />);

      const value = await screen.findByText('R$ 1.500,00');
      expect(value).toHaveClass('text-success');
    });

    it('Dado resumo financeiro, Quando renderizar, Então "A receber" e "Faturas pendentes" usam tom de alerta', async () => {
      mockFetch();
      renderWithToast(<DashboardPage />);

      const pending = await screen.findByText('R$ 500,00');
      expect(pending).toHaveClass('text-warning');
      const pendingCount = await screen.findByText('3');
      expect(pendingCount).toHaveClass('text-warning');
    });
  });

  describe('Cenário: banner de triagem usa token de urgência clínica', () => {
    it('Dado fotos aguardando triagem, Quando renderizar, Então o heading usa text-warning (não accent de marca)', async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      const heading = await screen.findByText(/aguardando triagem \(1\)/);
      expect(heading).toHaveClass('text-warning');
    });
  });

  describe('Cenário: cap da fila de triagem, com link pra página completa (issue #135)', () => {
    it('Dado mais de 8 fotos aguardando triagem, Quando renderizar, Então mostra a contagem total mas renderiza no máximo 8 itens', async () => {
      const photos = Array.from({ length: 9 }, (_, i) => ({
        ...triageFixture,
        id: `photo-${i}`,
        patientName: `Paciente ${i}`,
      }));
      mockFetch({ triage: photos });
      renderWithToast(<DashboardPage />);

      await screen.findByText(/aguardando triagem \(9\)/);
      expect(
        screen.getAllByText(/^Paciente \d — Ferida perna E$/),
      ).toHaveLength(8);
    });

    it('Dado fotos aguardando triagem, Quando renderizar, Então mostra link "Ver todas as fotos" apontando pra /triagem', async () => {
      mockFetch({ triage: [triageFixture] });
      renderWithToast(<DashboardPage />);

      const link = await screen.findByRole('link', {
        name: /Ver todas as fotos/,
      });
      expect(link).toHaveAttribute('href', '/triagem');
    });
  });

  describe('Cenário: feedback de processamento evita duplo-clique', () => {
    it("Dado clique em 'Ok, manter plano', Quando o PATCH ainda está em voo, Então desabilita os dois botões de ação e mostra 'Enviando…'", async () => {
      let resolvePatch: (() => void) | undefined;
      const patchPending = new Promise<void>((resolve) => {
        resolvePatch = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (url.startsWith('/api/summary'))
            return jsonResponse(true, summaryFixture);
          if (url.startsWith('/api/follow-ups')) return jsonResponse(true, []);
          if (url.startsWith('/api/supplies')) return jsonResponse(true, []);
          if (url.startsWith('/api/photos/triage'))
            return jsonResponse(true, [triageFixture]);
          if (url.startsWith('/api/photos/') && method === 'PATCH') {
            await patchPending;
            return jsonResponse(true, { ok: true });
          }
          throw new Error(`URL não mapeada: ${method} ${url}`);
        }),
      );
      renderWithToast(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Ok, manter plano'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(screen.getAllByText('Enviando…')).toHaveLength(2);
      });
      for (const button of screen.getAllByRole('button', {
        name: 'Enviando…',
      })) {
        expect(button).toBeDisabled();
      }

      resolvePatch?.();
      await screen.findByText('Foto revisada');
    });

    it("Dado clique em 'Concluir' em retorno pendente, Quando o PATCH ainda está em voo, Então desabilita o botão e mostra 'Enviando…'", async () => {
      let resolvePatch: (() => void) | undefined;
      const patchPending = new Promise<void>((resolve) => {
        resolvePatch = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (url.startsWith('/api/summary'))
            return jsonResponse(true, summaryFixture);
          if (url.startsWith('/api/follow-ups') && method === 'GET')
            return jsonResponse(true, [followUpFixture]);
          if (url.startsWith('/api/follow-ups/') && method === 'PATCH') {
            await patchPending;
            return jsonResponse(true, { ...followUpFixture, status: 'done' });
          }
          if (url.startsWith('/api/supplies')) return jsonResponse(true, []);
          if (url.startsWith('/api/photos/triage'))
            return jsonResponse(true, []);
          throw new Error(`URL não mapeada: ${method} ${url}`);
        }),
      );
      renderWithToast(<DashboardPage />);

      const concludeButton = await screen.findByText('Concluir');
      fireEvent.click(concludeButton);

      await waitFor(() => {
        expect(screen.getByText('Enviando…')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();

      resolvePatch?.();
      await screen.findByText('Retorno concluído');
    });
  });
});
