// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import DataRequestsPage from '@/app/(staff)/pedidos-titular/page';
import type { DataSubjectRequestDto } from '@/lib/dto';

import { DataRightsHarness } from '../support/portal-harness';

vi.mock('@/app/portal/actions', async () =>
  (await import('../support/portal-actions')).portalActionsOverFetch(),
);

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

describe('Equipe: fila de pedidos do titular (#293)', () => {
  it('Admin aceita com justificativa e a fila recarrega', async () => {
    let resolved = false;
    const calls = mockFetch((url, init) => {
      if (url === '/api/data-requests/r1' && init?.method === 'PATCH') {
        resolved = true;
        return { ok: true, body: { ...request(), notified: true } };
      }
      if (url === '/api/data-requests?status=pending')
        return { ok: true, body: resolved ? [] : [request()] };
      return undefined;
    });
    renderWithToast(<DataRequestsPage />);

    expect(await screen.findByText('Maria da Silva')).toBeTruthy();
    const accept = screen.getByRole('button', { name: 'Aceitar' });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Justificativa/), {
      target: { value: 'Telefone atualizado' },
    });
    fireEvent.click(accept);

    expect(await screen.findByText('Nenhum pedido aqui.')).toBeTruthy();
    const patch = calls.find((call) => call.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({
      decision: 'accept',
      justification: 'Telefone atualizado',
    });
  });

  it('recusa sem e-mail avisa que a resposta fica no portal; erro aparece na tela', async () => {
    let attempts = 0;
    mockFetch((url, init) => {
      if (url === '/api/data-requests/r1' && init?.method === 'PATCH') {
        attempts += 1;
        return attempts === 1
          ? { ok: false, body: 'Este pedido já foi analisado' }
          : { ok: true, body: { ...request(), notified: false } };
      }
      if (url.startsWith('/api/data-requests?status=')) {
        return { ok: true, body: [request()] };
      }
      return undefined;
    });
    renderWithToast(<DataRequestsPage />);

    fireEvent.change(await screen.findByLabelText(/Justificativa/), {
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

  it('troca a situação e mostra pedidos decididos com a justificativa', async () => {
    mockFetch((url) => {
      if (url === '/api/data-requests?status=pending')
        return { ok: true, body: [] };
      if (url === '/api/data-requests?status=accepted')
        return {
          ok: true,
          body: [
            request({
              status: 'accepted',
              resolution: 'Feito na ficha',
              resolvedAt: '2026-10-11T12:00:00.000Z',
            }),
          ],
        };
      return undefined;
    });
    renderWithToast(<DataRequestsPage />);

    expect(await screen.findByText('Nenhum pedido aqui.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Situação'), {
      target: { value: 'accepted' },
    });

    expect(await screen.findByText(/Feito na ficha/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aceitar' })).toBeNull();
  });
});

describe('Equipe: prazo dos pedidos do titular (#312)', () => {
  const deadlineOf = async (daysLeft: number | null) => {
    mockFetch((url) =>
      url.startsWith('/api/data-requests?status=')
        ? {
            ok: true,
            body: [
              request({
                daysLeft,
                deadlineDate: '2026-10-25',
                status: daysLeft === null ? 'accepted' : 'pending',
              }),
            ],
          }
        : undefined,
    );
    const view = renderWithToast(<DataRequestsPage />);
    await screen.findByText('Maria da Silva');
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
