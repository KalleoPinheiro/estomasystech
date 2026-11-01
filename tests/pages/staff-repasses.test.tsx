// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PayoutsPage from '@/app/(staff)/repasses/page';
import { zonedMonthKey } from '@/domain/shared/time-zone';
import type {
  CommissionPayoutDto,
  PayoutStatementDto,
  PayoutsResponseDto,
} from '@/lib/dto';
import { shiftMonth } from '@/lib/format';
import {
  actionError,
  actionOk,
  billing,
  mockBillingData,
  resetBillingData,
} from '../support/billing-data';
import { renderServerPage } from '../support/server-page';

vi.mock('next/navigation', async () => {
  const { billing } = await import('../support/billing-data');
  return {
    useRouter: () => ({ refresh: billing.refresh, push: vi.fn() }),
    usePathname: () => '/repasses',
  };
});
vi.mock('@/lib/server/session', async () => {
  const { billing } = await import('../support/billing-data');
  return { requireStaffPageFor: billing.requireStaffPageFor };
});
vi.mock('@/lib/server/data/payouts', async () => {
  const { billing } = await import('../support/billing-data');
  return {
    getClinicPayoutsFor: billing.getClinicPayoutsFor,
    getOwnPayoutsFor: billing.getOwnPayoutsFor,
  };
});
vi.mock('@/app/(staff)/repasses/payout-actions', async () => {
  const { billing } = await import('../support/billing-data');
  return {
    closePayout: billing.closePayout,
    cancelPayout: billing.cancelPayout,
  };
});

beforeEach(() => {
  resetBillingData();
});

afterEach(() => {
  cleanup();
});

/** Renderiza a tela no servidor, para o mês pedido na URL (padrão: o mês anterior). */
const renderPayouts = (month?: string) =>
  renderServerPage(() =>
    PayoutsPage({ searchParams: Promise.resolve({ month }) }),
  );

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
    mockBillingData({ payouts: clinicResponse });

    await renderPayouts();

    expect(await screen.findByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('40% da sessão')).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00 por sessão')).toBeInTheDocument();
    expect(screen.getByText('Aberto')).toBeInTheDocument();
    expect(screen.getByText('Pago em 05/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Repasses registrados')).toBeInTheDocument();
    expect(screen.getByText('1 sessões')).toBeInTheDocument();
  });

  it('Dado Admin, Quando registra o repasse do mês encerrado, Então envia o fechamento (a ação atualiza a tela)', async () => {
    mockBillingData({ payouts: clinicResponse });
    billing.closePayout.mockResolvedValue(actionOk({ ...closed, id: 'po-2' }));

    await renderPayouts('2020-01');
    fireEvent.click(await screen.findByText('Registrar repasse'));
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), {
      target: { value: 'transfer' },
    });
    fireEvent.click(screen.getByText('Confirmar repasse'));

    await waitFor(() => {
      expect(billing.closePayout).toHaveBeenCalledWith(
        expect.objectContaining({
          professionalId: 'pr-ana',
          period: '2020-01',
          paymentMethod: 'transfer',
        }),
      );
    });
    expect(await screen.findByText('Repasse registrado')).toBeInTheDocument();
  });

  it('Dado o mês corrente, Quando navega até ele, Então o fechamento fica indisponível', async () => {
    mockBillingData({ payouts: clinicResponse });
    const current = zonedMonthKey(new Date());

    await renderPayouts(shiftMonth(current, -1));
    // «Próximo mês» é um link para o mês seguinte: a navegação vai ao servidor.
    expect(await screen.findByLabelText('Próximo mês')).toHaveAttribute(
      'href',
      `/repasses?month=${current}`,
    );
    cleanup();

    await renderPayouts(current);

    expect(
      await screen.findByText(
        'O fechamento fica disponível depois que o mês terminar.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Registrar repasse')).toBeDisabled();
  });

  it('Dado Profissional, Quando abre a tela, Então pede o próprio extrato e vê a regra, sem ações de registro', async () => {
    mockBillingData({
      role: 'profissional',
      professionalId: 'pr-ana',
      payouts: {
        scope: 'own',
        period: '2020-01',
        rows: [anaRow],
        history: [],
      } satisfies PayoutsResponseDto,
    });

    await renderPayouts();

    expect(await screen.findByText('Meus repasses')).toBeInTheDocument();
    expect(screen.getByText('R$ 60,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument();
    expect(screen.getByText('40% da sessão')).toBeInTheDocument();
    expect(screen.queryByText('Registrar repasse')).not.toBeInTheDocument();
    expect(
      screen.getByText('Nenhum repasse registrado ainda.'),
    ).toBeInTheDocument();
    expect(billing.getOwnPayoutsFor).toHaveBeenCalled();
    expect(billing.getClinicPayoutsFor).not.toHaveBeenCalled();
  });

  it('Dado repasse já recebido pelo Profissional, Quando abre a tela, Então mostra o valor recebido e a data', async () => {
    mockBillingData({
      role: 'profissional',
      professionalId: 'pr-caio',
      payouts: {
        scope: 'own',
        period: '2020-01',
        rows: [caioRow],
        history: [closed],
      } satisfies PayoutsResponseDto,
    });

    await renderPayouts();

    expect(
      await screen.findByText(/Recebido pelo fechamento/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Ver sessões')[0]);
    expect(await screen.findByText('Curativo')).toBeInTheDocument();
  });

  it('Dada falha da API, Quando abre a tela, Então mostra o erro', async () => {
    mockBillingData({ payoutsError: 'Sem permissão para ver repasses' });

    await renderPayouts();

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
      mockBillingData({ payouts: withHistory });

      await renderPayouts();

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

    it('Dado Admin, Quando cancela com motivo, Então envia o motivo (a ação atualiza a tela)', async () => {
      mockBillingData({ payouts: withHistory });
      billing.cancelPayout.mockResolvedValue(
        actionOk({ ...closed, status: 'cancelled' }),
      );

      await renderPayouts();
      fireEvent.click(await screen.findByText('Cancelar'));
      fireEvent.change(screen.getByLabelText(/Motivo do cancelamento/), {
        target: { value: 'registrado em dobro' },
      });
      fireEvent.click(screen.getByText('Confirmar cancelamento'));

      await waitFor(() => {
        expect(billing.cancelPayout).toHaveBeenCalledWith({
          id: 'po-1',
          reason: 'registrado em dobro',
        });
      });
      expect(await screen.findByText('Repasse cancelado')).toBeInTheDocument();
    });

    it('Dada recusa da API ao cancelar, Então mostra o erro no formulário', async () => {
      mockBillingData({ payouts: withHistory });
      billing.cancelPayout.mockResolvedValue(
        actionError('Só o repasse mais recente pode ser cancelado'),
      );

      await renderPayouts();
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
      mockBillingData({
        role: 'profissional',
        professionalId: 'pr-caio',
        payouts: {
          scope: 'own',
          period: '2020-01',
          rows: [caioRow],
          history: [closed],
        } satisfies PayoutsResponseDto,
      });

      await renderPayouts();

      expect(await screen.findByText('Comprovante')).toBeInTheDocument();
      expect(screen.queryByText('Cancelar')).not.toBeInTheDocument();
    });
  });
});
