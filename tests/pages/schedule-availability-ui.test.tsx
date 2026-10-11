// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { CalendarGrid } from '@/app/(staff)/agenda/calendar-grid';
import { ClosuresSection } from '@/app/(staff)/configuracoes/closures-section';
import { LunchBreakFields } from '@/app/(staff)/configuracoes/lunch-break-fields';
import { AvailabilityForm } from '@/app/(staff)/profissionais/availability-form';
import type { ProfessionalDto, ScheduleClosureDto } from '@/lib/dto';

interface FakeResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}
interface Call {
  url: string;
  method: string;
  body: string | null;
}

const ok = (data: unknown): FakeResponse => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});
const failure = (error: string): FakeResponse => ({
  ok: false,
  json: async () => ({ success: false, data: null, error }),
});

function mockFetch(
  routes: { method?: string; path: string; respond: () => FakeResponse }[],
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: (init?.body as string) ?? null });
      const route = routes.find(
        (r) => url.startsWith(r.path) && (r.method ?? 'GET') === method,
      );
      if (!route) throw new Error(`URL não mapeada: ${method} ${url}`);
      return route.respond();
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ana: ProfessionalDto = {
  id: 'prof-1',
  fullName: 'Dra. Ana',
  registry: null,
  commissionType: 'percentage',
  commissionPct: null,
  commissionFixedCents: null,
  active: true,
} as ProfessionalDto;

const natal: ScheduleClosureDto = {
  id: 'c-1',
  professionalId: null,
  startsOn: '2099-12-25',
  endsOn: '2099-12-25',
  reason: 'Natal',
};
const ferias: ScheduleClosureDto = {
  id: 'c-2',
  professionalId: 'prof-1',
  startsOn: '2099-07-01',
  endsOn: '2099-07-15',
  reason: 'Férias',
};

describe('Feature: Feriados e ausências (configurações)', () => {
  it('Dado bloqueios cadastrados, Quando abrir, Então lista período, quem e motivo', async () => {
    mockFetch([
      {
        path: '/api/settings/schedule/closures',
        respond: () => ok([natal, ferias]),
      },
      { path: '/api/options/professionals', respond: () => ok([ana]) },
    ]);
    renderWithToast(<ClosuresSection />);

    const natalRow = (await screen.findByText('Natal')).closest('tr');
    expect(natalRow).toHaveTextContent('25/12/2099');
    expect(natalRow).toHaveTextContent('Clínica toda');
    const feriasRow = (await screen.findByText('Férias')).closest('tr');
    await waitFor(() => expect(feriasRow).toHaveTextContent('Dra. Ana'));
    expect(feriasRow).toHaveTextContent('01/07/2099 a 15/07/2099');
  });

  it('Dado nenhum bloqueio e lista de profissionais indisponível, Quando abrir, Então estado vazio e só a opção clínica toda', async () => {
    mockFetch([
      { path: '/api/settings/schedule/closures', respond: () => ok([]) },
      {
        path: '/api/options/professionals',
        respond: () => failure('Acesso negado'),
      },
    ]);
    renderWithToast(<ClosuresSection />);

    expect(
      await screen.findByText('Nenhum feriado ou ausência cadastrado.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Quem')).getAllByRole('option'),
    ).toHaveLength(1);
  });

  it('Dado formulário preenchido, Quando adicionar, Então envia o bloqueio e alerta as consultas já marcadas', async () => {
    const calls = mockFetch([
      {
        method: 'POST',
        path: '/api/settings/schedule/closures',
        respond: () =>
          ok({
            closure: ferias,
            affectedAppointments: [
              {
                id: 'a-1',
                startsAt: '2099-07-02T12:00:00.000Z',
                procedure: 'Curativo',
              },
            ],
          }),
      },
      { path: '/api/settings/schedule/closures', respond: () => ok([]) },
      { path: '/api/options/professionals', respond: () => ok([ana]) },
    ]);
    renderWithToast(<ClosuresSection />);

    await screen.findByRole('option', { name: 'Dra. Ana' });
    fireEvent.change(screen.getByLabelText('Quem'), {
      target: { value: 'prof-1' },
    });
    fireEvent.change(screen.getByLabelText('De *'), {
      target: { value: '2099-07-01' },
    });
    fireEvent.change(screen.getByLabelText('Até'), {
      target: { value: '2099-07-15' },
    });
    fireEvent.change(screen.getByLabelText('Motivo *'), {
      target: { value: 'Férias' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar bloqueio' }));

    expect(
      await screen.findByText(/Já havia 1 consulta marcada/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Curativo/)).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST');
    expect(JSON.parse(post?.body ?? '{}')).toEqual({
      professionalId: 'prof-1',
      startsOn: '2099-07-01',
      endsOn: '2099-07-15',
      reason: 'Férias',
    });
  });

  it('Dado erro ao cadastrar, Quando adicionar, Então mostra a mensagem', async () => {
    mockFetch([
      {
        method: 'POST',
        path: '/api/settings/schedule/closures',
        respond: () => failure('O bloqueio não pode terminar antes de começar'),
      },
      { path: '/api/settings/schedule/closures', respond: () => ok([]) },
      { path: '/api/options/professionals', respond: () => ok([]) },
    ]);
    renderWithToast(<ClosuresSection />);

    fireEvent.change(await screen.findByLabelText('De *'), {
      target: { value: '2099-07-10' },
    });
    fireEvent.change(screen.getByLabelText('Motivo *'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar bloqueio' }));

    expect(
      await screen.findByText('O bloqueio não pode terminar antes de começar'),
    ).toBeInTheDocument();
  });

  it('Dado bloqueio listado, Quando remover e confirmar, Então chama DELETE', async () => {
    const calls = mockFetch([
      {
        method: 'DELETE',
        path: '/api/settings/schedule/closures/c-1',
        respond: () => ok({ id: 'c-1' }),
      },
      { path: '/api/settings/schedule/closures', respond: () => ok([natal]) },
      { path: '/api/options/professionals', respond: () => ok([]) },
    ]);
    renderWithToast(<ClosuresSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE')).toBe(true),
    );
    expect(await screen.findByText('Bloqueio removido')).toBeInTheDocument();
  });

  it('Dado falha ao remover, Quando confirmar, Então avisa por toast', async () => {
    mockFetch([
      {
        method: 'DELETE',
        path: '/api/settings/schedule/closures/c-1',
        respond: () => failure('Bloqueio de agenda não encontrado(a)'),
      },
      { path: '/api/settings/schedule/closures', respond: () => ok([natal]) },
      { path: '/api/options/professionals', respond: () => ok([]) },
    ]);
    renderWithToast(<ClosuresSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));

    expect(
      await screen.findByText('Bloqueio de agenda não encontrado(a)'),
    ).toBeInTheDocument();
  });

  it('Dado falha ao listar, Quando abrir, Então mostra o erro', async () => {
    mockFetch([
      {
        path: '/api/settings/schedule/closures',
        respond: () => failure('Falha ao listar'),
      },
      { path: '/api/options/professionals', respond: () => ok([]) },
    ]);
    renderWithToast(<ClosuresSection />);
    expect(await screen.findByText('Falha ao listar')).toBeInTheDocument();
  });
});

describe('Feature: Horário do profissional (tela)', () => {
  it('Dado horário salvo na segunda, Quando abrir, Então segunda vem marcada e os demais dias desabilitados', async () => {
    mockFetch([
      {
        path: '/api/professionals/prof-1/availability',
        respond: () =>
          ok({ windows: [{ weekday: 1, startMinute: 480, endMinute: 720 }] }),
      },
    ]);
    renderWithToast(<AvailabilityForm professional={ana} onDone={() => {}} />);

    expect(await screen.findByLabelText('Segunda: início')).toHaveValue(
      '08:00',
    );
    expect(screen.getByLabelText('Segunda: fim')).toHaveValue('12:00');
    expect(screen.getByLabelText('Terça: início')).toBeDisabled();
  });

  it('Dado dias marcados, Quando salvar, Então envia só os dias ativos em minutos', async () => {
    const calls = mockFetch([
      {
        method: 'PUT',
        path: '/api/professionals/prof-1/availability',
        respond: () => ok({ windows: [] }),
      },
      {
        path: '/api/professionals/prof-1/availability',
        respond: () => ok({ windows: [] }),
      },
    ]);
    const onDone = vi.fn();
    renderWithToast(<AvailabilityForm professional={ana} onDone={onDone} />);

    const quarta = (await screen.findByText('Quarta')).closest('label');
    fireEvent.click(within(quarta as HTMLElement).getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Quarta: início'), {
      target: { value: '13:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar horários' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const put = calls.find((c) => c.method === 'PUT');
    expect(JSON.parse(put?.body ?? '{}')).toEqual({
      windows: [{ weekday: 3, startMinute: 810, endMinute: 1080 }],
    });
  });

  it('Dado erro ao salvar, Quando salvar, Então mostra a mensagem e não fecha', async () => {
    mockFetch([
      {
        method: 'PUT',
        path: '/api/professionals/prof-1/availability',
        respond: () => failure('Janelas sobrepostas na segunda'),
      },
      {
        path: '/api/professionals/prof-1/availability',
        respond: () => ok({ windows: [] }),
      },
    ]);
    const onDone = vi.fn();
    renderWithToast(<AvailabilityForm professional={ana} onDone={onDone} />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Salvar horários' }),
    );

    expect(
      await screen.findByText('Janelas sobrepostas na segunda'),
    ).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Dado falha ao carregar, Quando abrir, Então mostra o erro', async () => {
    mockFetch([
      {
        path: '/api/professionals/prof-1/availability',
        respond: () => failure('Profissional não encontrado'),
      },
    ]);
    renderWithToast(<AvailabilityForm professional={ana} onDone={() => {}} />);
    expect(
      await screen.findByText('Profissional não encontrado'),
    ).toBeInTheDocument();
  });
});

describe('Feature: Pausa de almoço (campos)', () => {
  it('Dado sem pausa, Quando marcar, Então propõe 12:00–13:00; ao desmarcar, volta a null', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <LunchBreakFields value={null} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenLastCalledWith({
      startMinute: 720,
      endMinute: 780,
    });

    rerender(
      <LunchBreakFields
        value={{ startMinute: 720, endMinute: 780 }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Fim da pausa'), {
      target: { value: '13:30' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      startMinute: 720,
      endMinute: 810,
    });
    fireEvent.change(screen.getByLabelText('Início da pausa'), {
      target: { value: '11:45' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      startMinute: 705,
      endMinute: 780,
    });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('Feature: Feriados na grade da agenda', () => {
  it('Dado feriado da clínica e ausência de profissional, Quando renderizar, Então o feriado bloqueia o dia e a ausência só avisa', () => {
    const onDayClick = vi.fn();
    render(
      <CalendarGrid
        monthDate={new Date(2099, 6, 1)}
        appointments={[]}
        closures={[
          { ...natal, startsOn: '2099-07-06', endsOn: '2099-07-06' },
          { ...ferias, startsOn: '2099-07-07', endsOn: '2099-07-07' },
        ]}
        professionalName={(id) => (id === 'prof-1' ? 'Dra. Ana' : '?')}
        onDayClick={onDayClick}
        onAppointmentClick={() => {}}
      />,
    );

    const closedDay = screen
      .getByText('Fechado: Natal')
      .closest('[role="button"]');
    expect(closedDay).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(closedDay as HTMLElement);
    expect(onDayClick).not.toHaveBeenCalled();

    const absenceDay = screen
      .getByText('Dra. Ana ausente')
      .closest('[role="button"]');
    expect(absenceDay).not.toHaveAttribute('aria-disabled');
    fireEvent.click(absenceDay as HTMLElement);
    expect(onDayClick).toHaveBeenCalled();
  });
});
