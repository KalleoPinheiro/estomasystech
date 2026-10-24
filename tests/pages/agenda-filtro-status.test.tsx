// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { CalendarGrid } from '@/app/(staff)/agenda/calendar-grid';
import AgendaPage from '@/app/(staff)/agenda/page';
import { layoutDay, visibleHours } from '@/app/(staff)/agenda/week-layout';
import { WeekView } from '@/app/(staff)/agenda/week-view';
import type { AppointmentDto } from '@/lib/dto';

// A URL é a fonte do filtro: o mock do roteador guarda a query num armazém e
// avisa quem a lê (como `useSearchParams` reage à navegação no Next).
const nav = vi.hoisted(() => {
  let search = '';
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Navega para `/agenda?...` (ou só `?...`), como o roteador faz. */
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
  scheduled: 3,
  confirmed: 1,
  completed: 0,
  cancelled: 4,
  no_show: 2,
};

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

const mockFetch = () => {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      let data: unknown = [];
      if (url.startsWith('/api/appointments/status-counts')) data = COUNTS;
      if (url.startsWith('/api/schedule-config')) {
        data = { config: undefined, isDefault: true };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data, error: null }),
      };
    }),
  );
  return urls;
};

const lastListUrl = (urls: string[]) =>
  urls.filter((u) => u.startsWith('/api/appointments?')).at(-1) as string;

const dto = (status: string): AppointmentDto => ({
  id: status,
  patientId: 'p',
  patientName: 'Paciente Teste',
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

describe('Feature: Filtro de status na página da agenda (#538)', () => {
  it('AGE-FLT-02/03: Dada a agenda sem parâmetro, Quando abrir, Então pede ao servidor o padrão sem canceladas', async () => {
    const urls = mockFetch();
    renderWithToast(<AgendaPage />);

    await screen.findByRole('button', { name: 'Agendada, 3 consultas' });
    await waitFor(() =>
      expect(lastListUrl(urls)).toContain(
        '&status=scheduled,confirmed,completed,no_show',
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Cancelada, 4 consultas' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('AGE-FLT-04: Dado ?status=completed, Quando abrir, Então só Concluída marcada e enviada ao servidor', async () => {
    nav.go('?status=completed');
    const urls = mockFetch();
    renderWithToast(<AgendaPage />);

    await waitFor(() =>
      expect(lastListUrl(urls)).toMatch(/&status=completed$/),
    );
    expect(
      await screen.findByRole('button', { name: 'Concluída, 0 consultas' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('AGE-FLT-01/04: Dado o padrão, Quando desmarcar e marcar chips, Então a URL reflete o recorte e a contagem não muda', async () => {
    const urls = mockFetch();
    renderWithToast(<AgendaPage />);
    await screen.findByRole('button', { name: 'Agendada, 3 consultas' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Agendada, 3 consultas' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Concluída, 0 consultas' }),
    );

    expect(nav.get()).toBe('?status=confirmed%2Cno_show');
    await waitFor(() =>
      expect(lastListUrl(urls)).toMatch(/&status=confirmed,no_show$/),
    );
    expect(
      screen.getByRole('button', { name: 'Agendada, 3 consultas' }),
    ).toBeTruthy();

    // Voltar ao padrão deixa a URL limpa.
    fireEvent.click(
      screen.getByRole('button', { name: 'Agendada, 3 consultas' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Concluída, 0 consultas' }),
    );
    expect(nav.get()).toBe('');
  });

  it('AGE-FLT-04: Dado ?status=xyz, Quando abrir, Então cai no padrão sem erro', async () => {
    nav.go('?status=xyz');
    mockFetch();
    renderWithToast(<AgendaPage />);

    expect(
      await screen.findByRole('button', { name: 'Agendada, 3 consultas' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('AGE-FLT-01: Dado nenhum status, Quando abrir, Então estado vazio com "Mostrar padrão" que restaura', async () => {
    nav.go('?status=');
    mockFetch();
    renderWithToast(<AgendaPage />);

    expect(await screen.findByText('Nenhum status marcado.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar padrão' }));

    await waitFor(() =>
      expect(screen.queryByText('Nenhum status marcado.')).toBeNull(),
    );
    expect(nav.get()).toBe('');
    expect(
      screen.getByRole('button', { name: 'Agendada, 3 consultas' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Feature: Canceladas pedidas pelo filtro aparecem na grade (#538)', () => {
  const cancelled = dto('cancelled');
  const config = {
    weekdays: [1, 2, 3, 4, 5],
    startHour: 8,
    endHour: 18,
    minGapMinutes: 15,
    lunchBreak: { startMinute: 720, endMinute: 780 },
  };

  it('Dada cancelada e showCancelled, Quando layoutDay/visibleHours, Então entram no horário', () => {
    expect(layoutDay([cancelled])).toHaveLength(0);
    expect(layoutDay([cancelled], true)).toHaveLength(1);
    const early = {
      ...cancelled,
      startsAt: new Date(2026, 9, 22, 6).toISOString(),
      endsAt: new Date(2026, 9, 22, 7).toISOString(),
    };
    expect(visibleHours(config, [early]).startHour).toBe(8);
    expect(visibleHours(config, [early], true).startHour).toBe(6);
  });

  it('Dada cancelada, Quando o mês é filtrado por cancelada, Então vira linha da célula em vez de "+N mais"', () => {
    const props = {
      monthDate: new Date(2026, 9, 1),
      appointments: [cancelled],
      onDayClick: vi.fn(),
      onAppointmentClick: vi.fn(),
    };
    const { unmount } = render(<CalendarGrid {...props} />);
    expect(screen.getByText('+1 mais')).toBeTruthy();
    unmount();
    render(<CalendarGrid {...props} showCancelled />);
    expect(screen.queryByText('+1 mais')).toBeNull();
  });

  it('Dada cancelada, Quando a semana é filtrada por cancelada, Então mostra o bloco e não o resumo', () => {
    const props = {
      weekStart: new Date(2026, 9, 18),
      appointments: [cancelled],
      scheduleConfig: config,
      closures: [],
      professionalName: () => 'Prof',
      onDayClick: vi.fn(),
      onAppointmentClick: vi.fn(),
    };
    const { unmount } = render(<WeekView {...props} />);
    expect(screen.getByText('1 cancelada')).toBeTruthy();
    unmount();
    render(<WeekView {...props} showCancelled />);
    expect(screen.queryByText('1 cancelada')).toBeNull();
    expect(screen.getByRole('button', { name: /Paciente/ })).toBeTruthy();
  });
});

describe('Feature: A URL é a única fonte do filtro de status (#538)', () => {
  it('Dado ?status=cancelled aberto, Quando o roteador navega para /agenda sem parâmetros (clique em «Agenda» no menu), Então volta ao padrão', async () => {
    nav.go('?status=cancelled');
    mockFetch();
    renderWithToast(<AgendaPage />);
    expect(
      await screen.findByRole('button', { name: 'Cancelada, 4 consultas' }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Clique em «Agenda» no menu: o roteador navega para /agenda sem parâmetros.
    act(() => {
      nav.go('/agenda');
    });

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Agendada, 3 consultas' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(
      screen.getByRole('button', { name: 'Cancelada, 4 consultas' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('Dado o padrão, Quando o roteador navega para ?status=no_show, Então só Faltou fica marcada', async () => {
    mockFetch();
    renderWithToast(<AgendaPage />);
    await screen.findByRole('button', { name: 'Agendada, 3 consultas' });

    act(() => {
      nav.go('/agenda?status=no_show');
    });

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Faltou, 2 consultas' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(
      screen.getByRole('button', { name: 'Agendada, 3 consultas' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
