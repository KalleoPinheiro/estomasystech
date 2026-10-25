// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import AgendaPage from '@/app/(staff)/agenda/page';
import type { AppointmentDto } from '@/lib/dto';

const nav = vi.hoisted(() => {
  let search = '';
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    go: (url: string) => {
      search = url.includes('?') ? `?${url.split('?')[1]}` : '';
      for (const listener of listeners) listener();
    },
  };
});

vi.mock('next/navigation', async () => {
  const React = await import('react');
  return {
    useRouter: () => ({
      push: vi.fn(),
      refresh: vi.fn(),
      replace: (url: string) => nav.go(url),
    }),
    useParams: () => ({}),
    usePathname: () => '/agenda',
    useSearchParams: () => {
      const search = React.useSyncExternalStore(
        nav.subscribe,
        nav.get,
        nav.get,
      );
      return React.useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

const COUNTS = {
  scheduled: 1,
  confirmed: 0,
  completed: 0,
  cancelled: 1,
  no_show: 0,
};

const dto = (
  id: string,
  status: string,
  patientName: string,
): AppointmentDto => ({
  id,
  patientId: 'p',
  patientName,
  startsAt: new Date(2026, 9, 22, 9).toISOString(),
  endsAt: new Date(2026, 9, 22, 10).toISOString(),
  procedure: 'Curativo',
  priceCents: 9000,
  notes: null,
  status,
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
});

/** Lista e contagem podem falhar (429) até `fail` ser desligado. */
function mockFetch(fail: { list: boolean; counts: boolean }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const isCounts = url.startsWith('/api/appointments/status-counts');
      const isList = url.startsWith('/api/appointments?');
      if ((isCounts && fail.counts) || (isList && fail.list)) {
        return {
          ok: false,
          status: 429,
          json: async () => ({
            success: false,
            data: null,
            error: 'Muitas requisições',
          }),
        };
      }
      let data: unknown = [];
      if (isCounts) data = COUNTS;
      if (isList) {
        data = url.includes('cancelled')
          ? [dto('c', 'cancelled', 'Paciente Cancelada')]
          : [dto('s', 'scheduled', 'Paciente Agendada')];
      }
      if (url.startsWith('/api/schedule-config')) {
        data = { config: undefined, isDefault: true };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data, error: null }),
      };
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 9, 0));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  nav.go('');
});

describe('Feature: busca da agenda que falha (#578)', () => {
  it('Dada a busca em 429 após marcar «Cancelada», Quando falha, Então alerta e botão no lugar da grade, sem a consulta do recorte anterior', async () => {
    const fail = { list: false, counts: false };
    mockFetch(fail);
    renderWithToast(<AgendaPage />);
    await screen.findByText(/Paciente Agendada/);

    fail.list = true;
    fireEvent.click(
      screen.getByRole('button', { name: /^Cancelada, 1 consulta/ }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Não foi possível carregar as consultas.',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    // A grade nunca mostra o dado do recorte anterior.
    expect(screen.queryByText(/Paciente Agendada/)).toBeNull();
    expect(screen.queryByText(/Paciente Cancelada/)).toBeNull();
  });

  it('Dado o alerta de erro, Quando clicar em «Tentar de novo» e a busca der certo, Então a grade mostra o recorte dos chips', async () => {
    const fail = { list: false, counts: false };
    mockFetch(fail);
    renderWithToast(<AgendaPage />);
    await screen.findByText(/Paciente Agendada/);
    fail.list = true;
    fireEvent.click(
      screen.getByRole('button', { name: /^Cancelada, 1 consulta/ }),
    );
    await screen.findByRole('alert');

    fail.list = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findByText(/Paciente Cancelada/)).toBeTruthy();
    // Chips e grade concordam: Cancelada marcada e a Agendada, do padrão, continua marcada.
    expect(
      screen.getByRole('button', { name: /^Cancelada, 1 consulta/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Agendada, 1 consulta' }),
    ).toBeTruthy();
  });

  it('Dada só a contagem em 429, Quando abrir, Então a grade aparece, os chips mostram «—» e o alerta oferece nova tentativa', async () => {
    mockFetch({ list: false, counts: true });
    renderWithToast(<AgendaPage />);

    expect(await screen.findByText(/Paciente Agendada/)).toBeTruthy();
    await screen.findByRole('alert');
    expect(
      screen.getByRole('button', { name: 'Agendada, indisponível' })
        .textContent,
    ).toContain('—');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });

  it('Dada a grade carregada, Quando refazer a mesma URL falha, Então a grade some e o alerta fica no lugar dela', async () => {
    const fail = { list: false, counts: true };
    mockFetch(fail);
    renderWithToast(<AgendaPage />);
    // Só a contagem falha: a grade da URL corrente segue visível com o alerta.
    expect(await screen.findByText(/Paciente Agendada/)).toBeTruthy();
    await screen.findByRole('alert');

    fail.list = true;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() =>
      expect(screen.queryByText(/Paciente Agendada/)).toBeNull(),
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível carregar as consultas.',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });
});
