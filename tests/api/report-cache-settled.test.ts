import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GetMonthlyReport,
  isReportSettled,
  type MonthlyReport,
} from '@/application/reports/get-monthly-report';
import { clearReportCache } from '@/lib/report-cache';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const settledReport = (): MonthlyReport => ({
  totalAppointments: 1,
  byStatus: {
    scheduled: 0,
    confirmed: 0,
    completed: 1,
    cancelled: 0,
    no_show: 0,
  },
  noShowRate: 0,
  revenueByProcedure: [],
  unattributedSupplyCostCents: 0,
  totalSupplyCostCents: 0,
  productionByProfessional: [
    {
      professionalId: 'prof-1',
      professionalName: 'Dra. Ana',
      count: 1,
      totalCents: 15000,
      commissionCents: 6000,
      releasedCommissionCents: 6000,
      pendingCommissionCents: 0,
    },
  ],
  billing: {
    paidCents: 15000,
    pendingCents: 0,
    totalInvoices: 1,
    paidCount: 1,
    pendingCount: 0,
    cancelledCount: 0,
  },
});

describe('Feature: Cache só de relatório assentado', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearReportCache();
  });

  describe('isReportSettled', () => {
    it('Dado relatório sem pendências, Então assentado', () => {
      expect(isReportSettled(settledReport())).toBe(true);
    });

    it('Dada fatura pendente, comissão a liberar ou consulta em aberto, Então não assentado', () => {
      const pendingInvoice = settledReport();
      pendingInvoice.billing.pendingCount = 1;
      const pendingCommission = settledReport();
      pendingCommission.productionByProfessional[0].pendingCommissionCents = 10;
      const openAppointment = settledReport();
      openAppointment.byStatus.confirmed = 1;

      expect(isReportSettled(pendingInvoice)).toBe(false);
      expect(isReportSettled(pendingCommission)).toBe(false);
      expect(isReportSettled(openAppointment)).toBe(false);
    });
  });

  const requestTwice = async (report: MonthlyReport) => {
    const execute = vi
      .spyOn(GetMonthlyReport.prototype, 'execute')
      .mockResolvedValue(report);
    const route = await import('@/app/api/reports/route');
    await route.GET(jsonRequest('/api/reports?month=2021-02', 'GET'));
    await route.GET(jsonRequest('/api/reports?month=2021-02', 'GET'));
    return execute.mock.calls.length;
  };

  it('Dado mês encerrado com fatura ainda pendente, Quando pedir duas vezes, Então recalcula (o pagamento posterior muda o relatório)', async () => {
    const report = settledReport();
    report.billing.pendingCount = 1;

    expect(await requestTwice(report)).toBe(2);
  });

  it('Dado mês encerrado e assentado, Quando pedir duas vezes, Então a segunda vem do cache', async () => {
    expect(await requestTwice(settledReport())).toBe(1);
  });
});
