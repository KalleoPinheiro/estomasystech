// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import DataRequestsPage from '@/app/(staff)/pedidos-titular/page';
import { ForbiddenError } from '@/domain/shared/errors';
import type { DataSubjectRequestDto } from '@/lib/dto';
import { DataRightsHarness } from '../support/portal-harness';
import { renderServerPage } from '../support/server-page';

vi.mock('@/app/portal/actions', async () =>
  (await import('../support/portal-actions')).portalActionsOverFetch(),
);

const queue = vi.hoisted(() => ({
  listDataRequestsFor: vi.fn(),
  requireStaffPageFor: vi.fn(),
  resolveDataRequest: vi.fn(),
}));

vi.mock('@/lib/server/session', () => ({
  requireStaffPageFor: queue.requireStaffPageFor,
}));
vi.mock('@/lib/server/data/data-requests', () => ({
  listDataRequestsFor: queue.listDataRequestsFor,
}));
vi.mock('@/app/(staff)/pedidos-titular/data-request-actions', () => ({
  resolveDataRequest: queue.resolveDataRequest,
}));

vi.mock('next/navigation', async () =>
  (await import('../support/portal-router')).navigationMock(),
);

type Responder = (
  url: string,
  init?: RequestInit,
) => { ok: boolean; body: unknown } | undefined;

function mockFetch(responder: Responder) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });
      const result = responder(url, init);
      if (!result) throw new Error(`URL não mapeada: ${url}`);
      return {
        ok: result.ok,
        status: result.ok ? 200 : 409,
        json: async () =>
          result.ok
            ? { success: true, data: result.body, error: null }
            : { success: false, data: null, error: result.body },
      };
    }),
  );
  return calls;
}

const request = (
  overrides: Partial<DataSubjectRequestDto> = {},
): DataSubjectRequestDto => ({
  id: 'r1',
  patientId: 'p1',
  patientName: 'Maria da Silva',
  kind: 'correction',
  details: 'Telefone novo',
  status: 'pending',
  resolution: null,
  createdAt: '2026-10-10T12:00:00.000Z',
  resolvedAt: null,
  deadlineDate: '2026-10-25',
  daysLeft: 12,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Portal: Meus dados (LGPD) (#293)', () => {
  it('mostra o aviso dos direitos, a resposta da clínica e envia um pedido de correção', async () => {
    const calls = mockFetch((url, init) => {
      if (
        url === '/api/portal/patient/data-requests' &&
        init?.method === 'POST'
      )
        return { ok: true, body: request() };
      if (url === '/api/portal/patient/data-requests')
        return {
          ok: true,
          body: [
            request({
              id: 'r0',
              kind: 'erasure',
              status: 'rejected',
              resolution: 'Guarda legal de 20 anos',
              details: null,
            }),
          ],
        };
      return undefined;
    });
    renderWithToast(<DataRightsHarness />);

    expect(
      screen.getByText(
        /A clínica analisa os pedidos e responde em até 15 dias/,
      ),
    ).toBeTruthy();
    expect(await screen.findByText(/Guarda legal de 20 anos/)).toBeTruthy();
    expect(screen.getByText('Recusado')).toBeTruthy();

    const send = screen.getByRole('button', { name: 'Enviar pedido' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('O que precisa ser corrigido?'), {
      target: { value: 'Telefone novo' },
    });
    fireEvent.click(send);

    await waitFor(() =>
      expect(calls.some((call) => call.init?.method === 'POST')).toBe(true),
    );
    const post = calls.find((call) => call.init?.method === 'POST');
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      kind: 'correction',
      details: 'Telefone novo',
    });
  });

  it('eliminação dispensa descrição e mostra o erro da API', async () => {
    mockFetch((url, init) => {
      if (
        url === '/api/portal/patient/data-requests' &&
        init?.method === 'POST'
      )
        return { ok: false, body: 'Você já tem um pedido deste tipo' };
      if (url === '/api/portal/patient/data-requests')
        return { ok: true, body: [] };
      return undefined;
    });
    renderWithToast(<DataRightsHarness />);

    fireEvent.change(screen.getByLabelText('Tipo de pedido'), {
      target: { value: 'erasure' },
    });
    expect(screen.getByLabelText('Motivo (opcional)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    expect(
      await screen.findByText('Você já tem um pedido deste tipo'),
    ).toBeTruthy();
  });

  it('baixa a cópia dos dados como arquivo JSON', async () => {
    mockFetch((url) => {
      if (url === '/api/portal/patient/export')
        return { ok: true, body: { patient: { id: 'p1' } } };
      if (url === '/api/portal/patient/data-requests')
        return { ok: true, body: [] };
      return undefined;
    });
    const createObjectURL = vi.fn(() => 'blob:meus-dados');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL, revokeObjectURL }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderWithToast(<DataRightsHarness />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Baixar cópia dos meus dados' }),
    );

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:meus-dados');
    click.mockRestore();
  });

  it('falha no download vira aviso, sem arquivo', async () => {
    mockFetch((url) => {
      if (url === '/api/portal/patient/export')
        return { ok: false, body: 'Paciente não encontrado(a)' };
      if (url === '/api/portal/patient/data-requests')
        return { ok: true, body: [] };
      return undefined;
    });
    renderWithToast(<DataRightsHarness />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Baixar cópia dos meus dados' }),
    );

    expect(
      (await screen.findAllByText('Paciente não encontrado(a)')).length,
    ).toBeGreaterThan(0);
  });
});

/** A fila que a camada de dados devolve por situação (a tela é do servidor, #555). */
const mockQueue = (
  byStatus: Partial<Record<string, DataSubjectRequestDto[]>>,
) => {
  queue.requireStaffPageFor.mockResolvedValue({
    role: 'company_admin',
    subject: 'admin@clinica.com',
    clinicId: 'c1',
  });
  queue.listDataRequestsFor.mockImplementation(
    async (_session: unknown, status: string) => byStatus[status] ?? [],
  );
};

const renderQueue = (status?: string) =>
  renderServerPage(() =>
    DataRequestsPage({ searchParams: Promise.resolve({ status }) }),
  );

describe('Equipe: fila de pedidos do titular (#293, #555)', () => {
  it('a fila chega no HTML, sem chamada /api, e o filtro de situação é por link', async () => {
    mockQueue({ pending: [request()] });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await renderQueue();

    expect(screen.getByText('Maria da Silva')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Aceito' })).toHaveAttribute(
      'href',
      '/pedidos-titular?status=accepted',
    );
    expect(screen.getByRole('link', { name: 'Em análise' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('Admin aceita com justificativa pela Server Action', async () => {
    mockQueue({ pending: [request()] });
    queue.resolveDataRequest.mockResolvedValue({
      success: true,
      data: { notified: true },
      error: null,
    });
    await renderQueue();

    const accept = screen.getByRole('button', { name: 'Aceitar' });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Justificativa/), {
      target: { value: 'Telefone atualizado' },
    });
    fireEvent.click(accept);

    await waitFor(() =>
      expect(queue.resolveDataRequest).toHaveBeenCalledWith({
        id: 'r1',
        decision: 'accept',
        justification: 'Telefone atualizado',
      }),
    );
    expect(await screen.findByText(/paciente avisado por e-mail/)).toBeTruthy();
  });

  it('recusa sem e-mail avisa que a resposta fica no portal; erro aparece na tela', async () => {
    mockQueue({ pending: [request()] });
    queue.resolveDataRequest
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: 'Este pedido já foi analisado',
      })
      .mockResolvedValueOnce({
        success: true,
        data: { notified: false },
        error: null,
      });
    await renderQueue();

    fireEvent.change(screen.getByLabelText(/Justificativa/), {
      target: { value: 'Não procede' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    expect(
      await screen.findByText('Este pedido já foi analisado'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    expect(
      await screen.findByText(/a resposta fica no portal do paciente/),
    ).toBeTruthy();
  });

  it('fila vazia mostra o estado vazio', async () => {
    mockQueue({});
    await renderQueue();
    expect(screen.getByText('Nenhum pedido aqui.')).toBeTruthy();
  });

  it('outro papel recebe o alerta de acesso, nunca a lista', async () => {
    queue.requireStaffPageFor.mockResolvedValue({ role: 'professional' });
    queue.listDataRequestsFor.mockRejectedValue(
      new ForbiddenError('Somente o Admin de Empresa'),
    );
    await renderQueue();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Maria da Silva')).toBeNull();
  });

  it('pede a situação da URL e mostra pedidos decididos com a justificativa, sem botões', async () => {
    mockQueue({
      accepted: [
        request({
          status: 'accepted',
          resolution: 'Feito na ficha',
          resolvedAt: '2026-10-11T12:00:00.000Z',
        }),
      ],
    });
    await renderQueue('accepted');

    expect(queue.listDataRequestsFor).toHaveBeenCalledWith(
      expect.anything(),
      'accepted',
    );
    expect(screen.getByText(/Feito na ficha/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aceitar' })).toBeNull();
  });

  it('situação desconhecida na URL volta para pendentes', async () => {
    mockQueue({});
    await renderQueue('qualquer');
    expect(queue.listDataRequestsFor).toHaveBeenCalledWith(
      expect.anything(),
      'pending',
    );
  });
});

describe('Equipe: prazo dos pedidos do titular (#312)', () => {
  const deadlineOf = async (daysLeft: number | null) => {
    mockQueue({
      pending: [
        request({
          daysLeft,
          deadlineDate: '2026-10-25',
          status: daysLeft === null ? 'accepted' : 'pending',
        }),
      ],
    });
    const view = await renderQueue();
    return view.container.querySelector('[data-deadline]');
  };

  it.each([
    [12, 'ok', 'Prazo para responder: 25/10/2026 · faltam 12 dias'],
    [3, 'soon', 'faltam 3 dias'],
    [1, 'soon', 'falta 1 dia'],
    [0, 'soon', 'vence hoje'],
    [-1, 'overdue', 'vencido há 1 dia'],
    [-4, 'overdue', 'vencido há 4 dias'],
  ])('com %i dia(s) restantes, destaca como %s', async (days, state, text) => {
    const line = await deadlineOf(days);

    expect(line?.getAttribute('data-deadline')).toBe(state);
    expect(line?.textContent).toContain(text);
  });

  it('pedido já decidido não mostra prazo', async () => {
    expect(await deadlineOf(null)).toBeNull();
  });
});
