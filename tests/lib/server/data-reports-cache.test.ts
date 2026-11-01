import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonthlyReport } from '@/application/reports/get-monthly-report';
import { startOfZonedMonth } from '@/domain/shared/time-zone';
import type { Session } from '@/lib/auth/session';
import { REPORT_MONTH_REGEX } from '@/lib/server/data/reports';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getRepositories: vi.fn(),
}));

vi.mock('@/application/reports/get-monthly-report', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/application/reports/get-monthly-report')
  >()),
  GetMonthlyReport: class {
    execute = mocks.execute;
  },
}));
vi.mock('@/infrastructure/container', () => ({
  getRepositories: mocks.getRepositories,
}));

const { getMonthlyReportFor } = await import('@/lib/server/data/reports');

const report = (settled: boolean): MonthlyReport =>
  ({
    totalAppointments: 1,
    byStatus: {
      scheduled: settled ? 0 : 1,
      confirmed: 0,
      completed: 1,
      cancelled: 0,
      no_show: 0,
    },
    noShowRate: 0,
    revenueByProcedure: [],
    unattributedSupplyCostCents: 0,
    totalSupplyCostCents: 0,
    productionByProfessional: [],
    billing: {
      paidCents: 0,
      pendingCents: 0,
      totalInvoices: 0,
      paidCount: 0,
      pendingCount: 0,
      cancelledCount: 0,
    },
  }) as unknown as MonthlyReport;

const session = (clinicId: string): Session =>
  ({ role: 'company_admin', subject: 'a@b.c', clinicId }) as unknown as Session;

/** Um mês encerrado no fim do ano passado: sempre fechado, em qualquer dia do teste. */
let counter = 0;
const closedMonth = () => `19${String(10 + counter++).padStart(2, '0')}-03`;

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.getRepositories.mockResolvedValue({});
});

describe('Feature: relatório do mês, intervalo e cache de mês encerrado (#555, ADR-069 § 3)', () => {
  it('Dado um mês, Quando lê, Então consulta de o primeiro instante do mês até o primeiro do seguinte', async () => {
    mocks.execute.mockResolvedValue(report(true));
    const month = closedMonth();

    await getMonthlyReportFor(session('c-int'), month);

    const year = Number(month.slice(0, 4));
    expect(mocks.execute).toHaveBeenCalledWith({
      from: startOfZonedMonth(year, 3),
      to: startOfZonedMonth(year, 4),
    });
  });

  it('Dado mês encerrado e assentado, Quando lê duas vezes, Então calcula uma só vez e guarda por mês', async () => {
    mocks.execute.mockResolvedValue(report(true));
    const month = closedMonth();

    await getMonthlyReportFor(session('c-cache'), month);
    await getMonthlyReportFor(session('c-cache'), month);
    expect(mocks.execute).toHaveBeenCalledTimes(1);

    await getMonthlyReportFor(session('c-cache'), closedMonth());
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('Dado o mesmo mês encerrado em outra empresa, Quando lê, Então não reaproveita o relatório da primeira', async () => {
    mocks.execute.mockResolvedValue(report(true));
    const month = closedMonth();

    await getMonthlyReportFor(session('c-um'), month);
    await getMonthlyReportFor(session('c-dois'), month);

    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('Dado mês encerrado ainda com consulta agendada, Quando lê duas vezes, Então não guarda e recalcula', async () => {
    mocks.execute.mockResolvedValue(report(false));
    const month = closedMonth();

    await getMonthlyReportFor(session('c-aberto'), month);
    await getMonthlyReportFor(session('c-aberto'), month);

    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('Dado o mês corrente, Quando lê duas vezes, Então nunca guarda', async () => {
    mocks.execute.mockResolvedValue(report(true));

    await getMonthlyReportFor(session('c-corrente'));
    await getMonthlyReportFor(session('c-corrente'));

    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('Dado o mês imediatamente anterior ao corrente, Quando lê duas vezes, Então já conta como encerrado e guarda', async () => {
    mocks.execute.mockResolvedValue(report(true));
    const { zonedMonthKey } = await import('@/domain/shared/time-zone');
    const previous = zonedMonthKey(new Date(), -1);

    await getMonthlyReportFor(session('c-anterior'), previous);
    await getMonthlyReportFor(session('c-anterior'), previous);

    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('Dado o formato do mês, Quando validar, Então exige YYYY-MM inteiro', () => {
    expect(REPORT_MONTH_REGEX.test('2026-03')).toBe(true);
    expect(REPORT_MONTH_REGEX.test('x2026-03')).toBe(false);
    expect(REPORT_MONTH_REGEX.test('2026-03x')).toBe(false);
  });
});
