// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReportsPage from '@/app/(staff)/relatorios/page';
import type { MonthlyReport } from '@/application/reports/get-monthly-report';

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: async () => ({ success: ok, data, error: ok ? null : 'Erro' }),
});

const errorResponse = (message: string) => ({
  ok: false,
  json: async () => ({ success: false, data: null, error: message }),
});

const mockFetch = (
  router: (url: string) => { ok: boolean; json: () => Promise<unknown> },
): ReturnType<typeof vi.fn> => {
  const fn = vi.fn(async (url: string) => router(url));
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const baseReport: MonthlyReport = {
  totalAppointments: 20,
  byStatus: {
    scheduled: 2,
    confirmed: 3,
    completed: 12,
    cancelled: 1,
    no_show: 2,
  },
  noShowRate: 0.1,
  revenueByProcedure: [
    {
      procedure: 'Troca de bolsa',
      count: 10,
      totalCents: 100000,
      supplyCostCents: 20000,
      marginCents: 80000,
    },
  ],
  unattributedSupplyCostCents: 0,
  totalSupplyCostCents: 20000,
  productionByProfessional: [
    {
      professionalId: 'pr-1',
      professionalName: 'Dra. Ana',
      count: 8,
      totalCents: 80000,
      commissionCents: 8000,
      releasedCommissionCents: 6000,
      pendingCommissionCents: 2000,
    },
    {
      professionalId: null,
      professionalName: 'Sem atribuição',
      count: 2,
      totalCents: 20000,
      commissionCents: null,
      releasedCommissionCents: null,
      pendingCommissionCents: null,
    },
  ],
  billing: {
    paidCents: 90000,
    pendingCents: 30000,
    totalInvoices: 15,
    paidCount: 10,
    pendingCount: 3,
    cancelledCount: 2,
  },
};

describe('Feature: Relatório gerencial', () => {
  describe('Cenário: carregamento', () => {
    it('Dado que o relatório ainda não chegou, Quando renderizar, Então exibe indicador de carregamento', () => {
      mockFetch(() => ({ ok: true, json: () => new Promise(() => {}) }));

      render(<ReportsPage />);

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
    });

    it('Dado erro ao carregar o relatório, Quando renderizar, Então exibe alerta de erro', async () => {
      mockFetch(() => errorResponse('Erro ao carregar relatório'));

      render(<ReportsPage />);

      expect(
        await screen.findByText('Erro ao carregar relatório'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: relatório com dados', () => {
    it('Dado um relatório completo, Quando renderizar, Então exibe os cartões de totais', async () => {
      mockFetch(() => jsonResponse(baseReport));

      render(<ReportsPage />);

      expect(await screen.findByText('20')).toBeInTheDocument();
      expect(screen.getByText('10,0%')).toBeInTheDocument();
      expect(screen.getByText('R$ 900,00')).toBeInTheDocument();
      expect(screen.getByText('R$ 300,00')).toBeInTheDocument();
    });

    it('Dado taxa de falta acima de 15%, Quando renderizar, Então destaca o indicador em vermelho', async () => {
      mockFetch(() => jsonResponse({ ...baseReport, noShowRate: 0.2 }));

      render(<ReportsPage />);

      const rate = await screen.findByText('20,0%');
      expect(rate.className).toContain('text-danger');
    });

    it('Dado taxa de falta dentro do esperado, Quando renderizar, Então mantém o indicador em cor neutra', async () => {
      mockFetch(() => jsonResponse({ ...baseReport, noShowRate: 0.05 }));

      render(<ReportsPage />);

      const rate = await screen.findByText('5,0%');
      expect(rate.className).toContain('text-accent-ink');
    });

    it('Dado consultas por status, Quando renderizar, Então lista os rótulos traduzidos com as contagens', async () => {
      mockFetch(() => jsonResponse(baseReport));

      render(<ReportsPage />);

      expect(await screen.findByText('Concluída')).toBeInTheDocument();
      expect(screen.getByText('Agendada')).toBeInTheDocument();
      expect(screen.getByText('Faltou')).toBeInTheDocument();
    });

    it('Dado receita por procedimento, Quando renderizar, Então exibe quantidade, receita, insumos e margem', async () => {
      mockFetch(() => jsonResponse(baseReport));

      render(<ReportsPage />);

      expect(await screen.findByText('Troca de bolsa')).toBeInTheDocument();
      expect(screen.getAllByText('R$ 1.000,00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('R$ 200,00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('R$ 800,00').length).toBeGreaterThan(0);
    });

    it('Dado nenhuma consulta concluída no mês, Quando renderizar, Então exibe estado vazio na seção de receita', async () => {
      mockFetch(() => jsonResponse({ ...baseReport, revenueByProcedure: [] }));

      render(<ReportsPage />);

      expect(
        await screen.findByText('Nenhuma consulta concluída no mês.'),
      ).toBeInTheDocument();
    });

    it('Dado custo de insumos não vinculado a consulta, Quando renderizar, Então exibe aviso com o valor', async () => {
      mockFetch(() =>
        jsonResponse({ ...baseReport, unattributedSupplyCostCents: 5000 }),
      );

      render(<ReportsPage />);

      expect(
        await screen.findByText(
          /Custo de insumos não vinculado a consulta no mês/,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('R$ 50,00')).toBeInTheDocument();
    });

    it('Dado margem negativa em um procedimento, Quando renderizar, Então destaca o valor em vermelho', async () => {
      mockFetch(() =>
        jsonResponse({
          ...baseReport,
          revenueByProcedure: [
            {
              procedure: 'Curativo especial',
              count: 1,
              totalCents: 5000,
              supplyCostCents: 8000,
              marginCents: -3000,
            },
          ],
        }),
      );

      render(<ReportsPage />);

      const margins = await screen.findAllByText('-R$ 30,00');
      expect(margins.some((el) => el.className.includes('text-danger'))).toBe(
        true,
      );
    });

    it('Dado produção por profissional, Quando renderizar, Então lista nome, contagem, receita e repasse', async () => {
      mockFetch(() => jsonResponse(baseReport));

      render(<ReportsPage />);

      expect(await screen.findByText('Dra. Ana')).toBeInTheDocument();
      expect(screen.getByText('Sem atribuição')).toBeInTheDocument();
      expect(screen.getAllByText('R$ 80,00').length).toBeGreaterThan(0);
    });

    it('Dado repasse parcialmente liberado, Quando renderizar, Então separa apurado, liberado e a liberar', async () => {
      mockFetch(() => jsonResponse(baseReport));

      render(<ReportsPage />);

      await screen.findByText('Dra. Ana');
      expect(screen.getByText('Repasse apurado')).toBeInTheDocument();
      expect(screen.getByText('Liberado')).toBeInTheDocument();
      expect(screen.getByText('A liberar')).toBeInTheDocument();
      expect(screen.getAllByText('R$ 60,00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('R$ 20,00').length).toBeGreaterThan(0);
      expect(screen.getByText(/atraso acima de 60 dias/)).toBeInTheDocument();
    });

    it('Dado produção sem nenhum registro, Quando renderizar, Então exibe a seção com estado vazio (REL-05)', async () => {
      mockFetch(() =>
        jsonResponse({ ...baseReport, productionByProfessional: [] }),
      );

      render(<ReportsPage />);

      await screen.findByText('Troca de bolsa');
      expect(screen.getByText('Produção por profissional')).toBeInTheDocument();
      expect(
        screen.getByText('Nenhuma produção por profissional no mês.'),
      ).toBeInTheDocument();
    });

    it("Dado nenhuma consulta no mês, Quando renderizar, Então 'Consultas por status' exibe estado vazio (REL-05)", async () => {
      mockFetch(() => jsonResponse({ ...baseReport, byStatus: {} }));

      render(<ReportsPage />);

      expect(
        await screen.findByText('Nenhuma consulta no mês.'),
      ).toBeInTheDocument();
    });

    it('Dado mês atual e mês anterior com dado diferente, Quando renderizar, Então mostra o delta percentual (REL-04)', async () => {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthParam = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
      mockFetch((url) => {
        if (url.includes(`month=${prevMonthParam}`)) {
          return jsonResponse({ ...baseReport, totalAppointments: 10 });
        }
        return jsonResponse(baseReport);
      });

      render(<ReportsPage />);

      expect(
        await screen.findByText('+100,0% vs mês anterior'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: navegação por mês', () => {
    it('Dado clique nas setas de navegação, Quando acionadas, Então refaz a busca com o novo mês', async () => {
      const fetchMock = mockFetch(() => jsonResponse(baseReport));

      render(<ReportsPage />);
      await screen.findByText('Troca de bolsa');

      fireEvent.click(screen.getByLabelText('Mês anterior'));

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([url]) => {
            const current = new Date();
            const prevMonth = new Date(
              current.getFullYear(),
              current.getMonth() - 1,
              1,
            );
            const expected = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
            return String(url).includes(`/api/reports?month=${expected}`);
          }),
        ).toBe(true);
      });
    });

    it('Dado rótulo do mês, Quando renderizar, Então está em pt-BR sem depender do locale do input nativo', async () => {
      mockFetch(() => jsonResponse(baseReport));

      render(<ReportsPage />);
      await screen.findByText('Troca de bolsa');

      const now = new Date();
      const expectedLabel = now
        .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        .replace(/^./, (c) => c.toUpperCase());
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });
  });
});
