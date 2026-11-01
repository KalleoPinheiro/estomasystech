// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReportsPage from '@/app/(staff)/relatorios/page';
import type { MonthlyReport } from '@/application/reports/get-monthly-report';
import { ValidationError } from '@/domain/shared/errors';
import { renderServerPage } from '../support/server-page';

const reports = vi.hoisted(() => ({
  getMonthlyReportFor: vi.fn(),
  requireStaffPageFor: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/server/session', () => ({
  requireStaffPageFor: reports.requireStaffPageFor,
}));
vi.mock('@/lib/server/data/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/data/reports')>()),
  getMonthlyReportFor: reports.getMonthlyReportFor,
}));

/** O relatório que a camada de dados devolve por mês pedido (a tela é do servidor, #555). */
const mockReports = (
  report: (month: string) => MonthlyReport | Error,
): void => {
  reports.requireStaffPageFor.mockResolvedValue({
    role: 'company_admin',
    subject: 'admin@clinica.com',
    clinicId: 'c1',
  });
  reports.getMonthlyReportFor.mockImplementation(
    async (_session: unknown, month: string) => {
      const result = report(month);
      if (result instanceof Error) throw result;
      return result;
    },
  );
};

const fetchSpy = vi.fn();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const renderPage = async (month?: string) => {
  vi.stubGlobal('fetch', fetchSpy);
  return renderServerPage(() =>
    ReportsPage({ searchParams: Promise.resolve({ month }) }),
  );
};

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
      supplyCostKnown: true,
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
    it('Dado a carga inicial, Quando renderizar, Então o relatório já vem no HTML sem nenhuma chamada /api', async () => {
      mockReports(() => baseReport);

      await renderPage();

      expect(screen.getByText('Troca de bolsa')).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('Dado erro ao carregar o relatório, Quando renderizar, Então exibe alerta de erro', async () => {
      mockReports(() => new ValidationError('Erro ao carregar relatório'));

      await renderPage();

      expect(
        await screen.findByText('Erro ao carregar relatório'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: relatório com dados', () => {
    it('Dado um relatório completo, Quando renderizar, Então exibe os cartões de totais', async () => {
      mockReports(() => baseReport);

      await renderPage();

      expect(await screen.findByText('20')).toBeInTheDocument();
      expect(screen.getByText('10,0%')).toBeInTheDocument();
      expect(screen.getByText('R$ 900,00')).toBeInTheDocument();
      expect(screen.getByText('R$ 300,00')).toBeInTheDocument();
    });

    it('Dado taxa de falta acima de 15%, Quando renderizar, Então destaca o indicador em vermelho', async () => {
      mockReports(() => ({ ...baseReport, noShowRate: 0.2 }));

      await renderPage();

      const rate = await screen.findByText('20,0%');
      expect(rate.className).toContain('text-danger');
    });

    it('Dado taxa de falta dentro do esperado, Quando renderizar, Então mantém o indicador em cor neutra', async () => {
      mockReports(() => ({ ...baseReport, noShowRate: 0.05 }));

      await renderPage();

      const rate = await screen.findByText('5,0%');
      expect(rate.className).toContain('text-accent-ink');
    });

    it('Dado consultas por status, Quando renderizar, Então lista os rótulos traduzidos com as contagens', async () => {
      mockReports(() => baseReport);

      await renderPage();

      expect(await screen.findByText('Concluída')).toBeInTheDocument();
      expect(screen.getByText('Agendada')).toBeInTheDocument();
      expect(screen.getByText('Faltou')).toBeInTheDocument();
    });

    it('Dado receita por procedimento, Quando renderizar, Então exibe quantidade, receita, insumos e margem', async () => {
      mockReports(() => baseReport);

      await renderPage();

      expect(await screen.findByText('Troca de bolsa')).toBeInTheDocument();
      expect(screen.getAllByText('R$ 1.000,00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('R$ 200,00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('R$ 800,00').length).toBeGreaterThan(0);
    });

    it('Dado nenhuma consulta concluída no mês, Quando renderizar, Então exibe estado vazio na seção de receita', async () => {
      mockReports(() => ({ ...baseReport, revenueByProcedure: [] }));

      await renderPage();

      expect(
        await screen.findByText('Nenhuma consulta concluída no mês.'),
      ).toBeInTheDocument();
    });

    it('Dado custo de insumos não vinculado a consulta, Quando renderizar, Então exibe aviso com o valor', async () => {
      mockReports(() => ({ ...baseReport, unattributedSupplyCostCents: 5000 }));

      await renderPage();

      expect(
        await screen.findByText(
          /Custo de insumos não vinculado a consulta no mês/,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('R$ 50,00')).toBeInTheDocument();
    });

    it('Dado margem negativa em um procedimento, Quando renderizar, Então destaca o valor em vermelho', async () => {
      mockReports(() => ({
        ...baseReport,
        revenueByProcedure: [
          {
            procedure: 'Curativo especial',
            count: 1,
            totalCents: 5000,
            supplyCostCents: 8000,
            supplyCostKnown: true,
            marginCents: -3000,
          },
        ],
      }));

      await renderPage();

      const margins = await screen.findAllByText('-R$ 30,00');
      expect(margins.some((el) => el.className.includes('text-danger'))).toBe(
        true,
      );
    });

    it('Dado procedimento sem custo de insumo apurado, Quando renderizar, Então mostra Não apurado e não uma margem igual à receita', async () => {
      mockReports(() => ({
        ...baseReport,
        revenueByProcedure: [
          {
            procedure: 'Curativo com desbridamento',
            count: 2,
            totalCents: 176000,
            supplyCostCents: 0,
            supplyCostKnown: false,
            marginCents: 176000,
          },
        ],
      }));

      await renderPage();

      expect((await screen.findAllByText('Não apurado')).length).toBe(2);
      expect(
        screen.getByText(/custo e margem não apurados/),
      ).toBeInTheDocument();
      expect(screen.getAllByText('R$ 1.760,00')).toHaveLength(2);
    });

    it('Dado produção por profissional, Quando renderizar, Então lista nome, contagem, receita e repasse', async () => {
      mockReports(() => baseReport);

      await renderPage();

      expect(await screen.findByText('Dra. Ana')).toBeInTheDocument();
      expect(screen.getByText('Sem atribuição')).toBeInTheDocument();
      expect(screen.getAllByText('R$ 80,00').length).toBeGreaterThan(0);
    });

    it('Dado repasse parcialmente liberado, Quando renderizar, Então separa apurado, liberado e a liberar', async () => {
      mockReports(() => baseReport);

      await renderPage();

      await screen.findByText('Dra. Ana');
      expect(screen.getByText('Repasse apurado')).toBeInTheDocument();
      expect(screen.getByText('Liberado')).toBeInTheDocument();
      expect(screen.getByText('A liberar')).toBeInTheDocument();
      expect(screen.getAllByText('R$ 60,00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('R$ 20,00').length).toBeGreaterThan(0);
      expect(screen.getByText(/atraso acima de 60 dias/)).toBeInTheDocument();
    });

    it('Dado produção sem nenhum registro, Quando renderizar, Então exibe a seção com estado vazio (REL-05)', async () => {
      mockReports(() => ({ ...baseReport, productionByProfessional: [] }));

      await renderPage();

      await screen.findByText('Troca de bolsa');
      expect(screen.getByText('Produção por profissional')).toBeInTheDocument();
      expect(
        screen.getByText('Nenhuma produção por profissional no mês.'),
      ).toBeInTheDocument();
    });

    it("Dado nenhuma consulta no mês, Quando renderizar, Então 'Consultas por status' exibe estado vazio (REL-05)", async () => {
      mockReports(() => ({
        ...baseReport,
        byStatus: {} as MonthlyReport['byStatus'],
      }));

      await renderPage();

      expect(
        await screen.findByText('Nenhuma consulta no mês.'),
      ).toBeInTheDocument();
    });

    it('Dado mês atual e mês anterior com dado diferente, Quando renderizar, Então mostra o delta percentual (REL-04)', async () => {
      const current = new Date();
      const previous = new Date(
        current.getFullYear(),
        current.getMonth() - 1,
        1,
      );
      const previousKey = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
      mockReports((month) =>
        month === previousKey
          ? { ...baseReport, totalAppointments: 10 }
          : baseReport,
      );

      await renderPage();

      expect(
        await screen.findByText('+100,0% vs mês anterior'),
      ).toBeInTheDocument();
    });

    it('Dado que o mês anterior falha, Quando renderizar, Então o mês pedido aparece sem os deltas', async () => {
      const current = new Date();
      const previous = new Date(
        current.getFullYear(),
        current.getMonth() - 1,
        1,
      );
      const previousKey = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
      mockReports((month) =>
        month === previousKey ? new ValidationError('falhou') : baseReport,
      );

      await renderPage();

      expect(screen.getByText('Troca de bolsa')).toBeInTheDocument();
      expect(screen.queryByText(/vs mês anterior/)).not.toBeInTheDocument();
    });
  });

  describe('Cenário: navegação por mês', () => {
    it('Dado o mês na URL, Quando renderizar, Então carrega esse mês e as setas levam ao anterior e ao próximo por link', async () => {
      mockReports(() => baseReport);

      await renderPage('2026-03');

      expect(reports.getMonthlyReportFor).toHaveBeenCalledWith(
        expect.anything(),
        '2026-03',
      );
      expect(screen.getByLabelText('Mês anterior')).toHaveAttribute(
        'href',
        '/relatorios?month=2026-02',
      );
      expect(screen.getByLabelText('Próximo mês')).toHaveAttribute(
        'href',
        '/relatorios?month=2026-04',
      );
      expect(screen.getByText('Março de 2026')).toBeInTheDocument();
    });

    it('Dado mês inválido na URL, Quando renderizar, Então volta ao mês corrente', async () => {
      mockReports(() => baseReport);

      await renderPage('2026-13');

      const now = new Date();
      const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      expect(reports.getMonthlyReportFor).toHaveBeenCalledWith(
        expect.anything(),
        key,
      );
    });

    it('Dado rótulo do mês, Quando renderizar, Então está em pt-BR sem depender do locale do input nativo', async () => {
      mockReports(() => baseReport);

      await renderPage();
      await screen.findByText('Troca de bolsa');

      const now = new Date();
      const expectedLabel = now
        .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        .replace(/^./, (c) => c.toUpperCase());
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });
  });
});
