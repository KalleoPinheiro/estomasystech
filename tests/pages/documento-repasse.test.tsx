// @vitest-environment jsdom

import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PayoutReceiptPage from '@/app/documentos/repasse/[payoutId]/page';
import type {
  ClinicInfoDto,
  CommissionPayoutDto,
  PayoutReceiptDto,
} from '@/lib/dto';
import { renderWithToast } from '../support/render-with-toast';

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: async () => ({
    success: ok,
    data,
    error: ok ? null : 'Repasse não encontrado',
  }),
});

const CLINIC: ClinicInfoDto = {
  name: 'Clínica EstomaSysTech',
  cnpj: '12.345.678/0001-95',
  address: 'Rua das Flores, 100',
  city: 'São Paulo',
  professionalName: 'Enf. Resp.',
  professionalRegistry: 'COREN-SP 1',
};

const payout: CommissionPayoutDto = {
  id: 'po-1',
  professionalId: 'pr-ana',
  professionalName: 'Dra. Ana',
  period: '2026-08',
  totalCents: 4000,
  paidAt: '2026-09-05T12:00:00.000Z',
  paymentMethod: 'pix',
  notes: 'pago junto com o adiantamento',
  createdBy: 'admin@clinica.com',
  createdAt: '2026-09-05T12:00:00.000Z',
  rule: { kind: 'percentage', pct: 40 },
  status: 'active',
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  items: [
    {
      appointmentId: 'a1',
      kind: 'session',
      procedure: 'Curativo',
      sessionDate: '2026-08-10T12:00:00.000Z',
      baseCents: 25000,
      commissionCents: 10000,
    },
    {
      appointmentId: 'a0',
      kind: 'reversal',
      procedure: 'Troca de bolsa',
      sessionDate: '2026-07-10T12:00:00.000Z',
      baseCents: 15000,
      commissionCents: -6000,
    },
  ],
};

const receipt = (
  over: Partial<CommissionPayoutDto> = {},
): PayoutReceiptDto => ({
  payout: { ...payout, ...over },
  professional: { fullName: 'Dra. Ana', registry: 'COREN-SP 999' },
});

const mockFetch = (
  role: string,
  receiptResponse: ReturnType<typeof jsonResponse>,
  clinic: ClinicInfoDto = CLINIC,
) => {
  const fn = vi.fn(async (url: string) => {
    if (url === '/api/auth/identity')
      return jsonResponse({ clinicLabel: 'C', account: { role } });
    if (url === '/api/clinic-info') return jsonResponse(clinic);
    if (url === '/api/documents/issue')
      return jsonResponse({
        documentNumber: 'REP-ABCD1234',
        issuedAt: '2026-09-06T10:00:00.000Z',
      });
    return receiptResponse;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

const render = async () => {
  await act(async () => {
    renderWithToast(
      <PayoutReceiptPage params={Promise.resolve({ payoutId: 'po-1' })} />,
    );
  });
};

const urls = (fn: ReturnType<typeof mockFetch>) =>
  fn.mock.calls.map(([url]) => String(url));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Comprovante de repasse', () => {
  it('Dado Admin, Quando abre o comprovante, Então mostra valor, mês, forma, regra, sessões, estorno, total e assinatura do profissional', async () => {
    const fetchMock = mockFetch('company_admin', jsonResponse(receipt()));

    await render();

    expect(
      await screen.findByText('Comprovante de Repasse'),
    ).toBeInTheDocument();
    expect(urls(fetchMock)).toContain('/api/commission-payouts/po-1');
    expect(screen.getAllByText('R$ 40,00')).toHaveLength(2);
    expect(screen.getByText('Agosto de 2026')).toBeInTheDocument();
    expect(screen.getByText('Pix')).toBeInTheDocument();
    expect(screen.getByText('40% da sessão')).toBeInTheDocument();
    expect(screen.getByText('Curativo')).toBeInTheDocument();
    expect(screen.getByText(/estorno \(fatura cancelada/)).toBeInTheDocument();
    expect(screen.getByText('-R$ 60,00')).toBeInTheDocument();
    expect(screen.getByText(/COREN-SP 999/)).toBeInTheDocument();
    expect(
      screen.getByText('Profissional — recebi o valor acima'),
    ).toBeInTheDocument();
    expect(screen.getByText(/REP-ABCD1234/)).toBeInTheDocument();
    expect(
      screen.getByText('Observações: pago junto com o adiantamento'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Cancelado')).not.toBeInTheDocument();
  });

  it('Dado Profissional, Quando abre o comprovante, Então busca pelo endpoint do próprio extrato', async () => {
    const fetchMock = mockFetch('profissional', jsonResponse(receipt()));

    await render();

    expect(
      await screen.findByText('Comprovante de Repasse'),
    ).toBeInTheDocument();
    expect(urls(fetchMock)).toContain('/api/my-payouts/po-1');
    expect(urls(fetchMock)).not.toContain('/api/commission-payouts/po-1');
  });

  it('Dado repasse cancelado, Então o comprovante traz a marca CANCELADO com o motivo', async () => {
    mockFetch(
      'company_admin',
      jsonResponse(
        receipt({
          status: 'cancelled',
          cancelledAt: '2026-09-07T12:00:00.000Z',
          cancelReason: 'valor errado',
        }),
      ),
    );

    await render();

    expect(await screen.findByText('Cancelado')).toBeInTheDocument();
    expect(screen.getByText(/motivo: valor errado/)).toBeInTheDocument();
  });

  it('Dado regra de valor fixo, Então não mostra a nota de pacote', async () => {
    mockFetch(
      'company_admin',
      jsonResponse(receipt({ rule: { kind: 'fixed', centsPerSession: 5000 } })),
    );

    await render();

    expect(await screen.findByText('R$ 50,00 por sessão')).toBeInTheDocument();
    expect(screen.queryByText(/sessões de pacote/)).not.toBeInTheDocument();
  });

  it('Dada clínica sem CNPJ/responsável, Então bloqueia o documento', async () => {
    mockFetch('company_admin', jsonResponse(receipt()), {
      ...CLINIC,
      cnpj: null,
    });

    await render();

    expect(
      await screen.findByText(/Clínica sem CNPJ ou responsável técnico/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Comprovante de Repasse'),
    ).not.toBeInTheDocument();
  });

  it('Dado repasse de outro profissional (404), Então mostra o erro', async () => {
    mockFetch('profissional', jsonResponse(null, false));

    await render();

    expect(
      await screen.findByText('Repasse não encontrado'),
    ).toBeInTheDocument();
  });
});

describe('Feature: comprovante de repasse no celular (layout mobile-first, AC 30)', () => {
  it('tabela do comprovante dentro de contêiner com rolagem', async () => {
    mockFetch('company_admin', jsonResponse(receipt()));

    await render();

    await screen.findByText('Comprovante de Repasse');
    const tables = document.querySelectorAll('table');
    expect(tables.length).toBeGreaterThan(0);
    for (const table of Array.from(tables)) {
      // `.sv-table-container` da lib declara `overflow-x: auto`: uma tabela larga
      // rola dentro de si e a página do documento não ganha rolagem lateral.
      expect(table.closest('.sv-table-container')).not.toBeNull();
    }
  });
});
