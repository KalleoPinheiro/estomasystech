// @vitest-environment jsdom

import { ToastProvider } from '@still-void/ui/react/client';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgendaScreen } from '@/app/(staff)/agenda/agenda-screen';
import type { AppointmentDto } from '@/lib/dto';
import {
  agenda,
  click,
  DEFAULT_COUNTS,
  DEFAULT_TEST_SCHEDULE_CONFIG,
  renderAgenda,
  resetAgenda,
} from '../support/agenda-app';

vi.mock('next/navigation', async () => {
  const { agenda } = await import('../support/agenda-app');
  return {
    useRouter: () => agenda.router,
    useParams: () => ({}),
    usePathname: () => '/agenda',
  };
});
vi.mock('@/app/(staff)/agenda/agenda-actions', async () => {
  const { legacyActions } = await import('../support/agenda-app');
  return legacyActions;
});
vi.mock('@/lib/server/session', async () => {
  const { agenda } = await import('../support/agenda-app');
  return { requireStaffPage: agenda.requireStaffPage };
});
vi.mock('@/lib/server/data/appointments', async () => {
  const { agenda } = await import('../support/agenda-app');
  return {
    listAppointmentsFor: agenda.listAppointmentsFor,
    countAppointmentsFor: agenda.countAppointmentsFor,
  };
});
vi.mock('@/lib/server/data/professionals', async () => {
  const { agenda } = await import('../support/agenda-app');
  return { listProfessionalOptions: agenda.listProfessionalOptions };
});
vi.mock('@/lib/server/data/schedule', async () => {
  const { agenda } = await import('../support/agenda-app');
  return {
    loadScheduleConfig: agenda.loadScheduleConfig,
    listClosuresFor: agenda.listClosuresFor,
  };
});
vi.mock('@/lib/server/data/waitlist', async () => {
  const { agenda } = await import('../support/agenda-app');
  return { listWaitlistFor: agenda.listWaitlistFor };
});

const appointment = (
  overrides: Partial<AppointmentDto> = {},
): AppointmentDto => ({
  id: 'appt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: new Date(2026, 9, 22, 9).toISOString(),
  endsAt: new Date(2026, 9, 22, 10).toISOString(),
  procedure: 'Troca de bolsa',
  priceCents: 12000,
  notes: null,
  status: 'scheduled',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
  ...overrides,
});

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 9, 0));
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Feature: Agenda lida no servidor (#551)', () => {
  describe('Cenário: carga sem /api', () => {
    it('Dada a agenda aberta, Quando carregar, Então todas as leituras vêm do servidor, uma vez, e o navegador não chama /api', async () => {
      resetAgenda({
        appointments: [appointment()],
        professionals: [{ id: 'prof-1', fullName: 'Dra. Ana', active: true }],
        counts: { ...DEFAULT_COUNTS, scheduled: 1 },
      });

      await renderAgenda();

      expect(await screen.findByText(/Maria Souza/)).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
      for (const read of [
        agenda.listAppointmentsFor,
        agenda.countAppointmentsFor,
        agenda.listProfessionalOptions,
        agenda.loadScheduleConfig,
        agenda.listClosuresFor,
        agenda.listWaitlistFor,
      ]) {
        expect(read).toHaveBeenCalledTimes(1);
      }
      expect(agenda.requireStaffPage).toHaveBeenCalledWith({ next: '/agenda' });
    });

    it('Dado o mês de outubro, Quando carregar, Então o servidor lê o mês e os feriados dos dias vizinhos da grade', async () => {
      resetAgenda();

      await renderAgenda();

      const [, range] = agenda.listAppointmentsFor.mock.calls[0];
      expect(range.from.getTime()).toBeLessThan(range.to.getTime());
      expect(agenda.listClosuresFor).toHaveBeenCalledWith(expect.anything(), {
        from: '2026-09-24',
        to: '2026-11-07',
      });
    });

    it('Dado o Profissional na sessão, Quando carregar, Então as leituras recebem a sessão dele (o escopo R4 é da camada de dados)', async () => {
      resetAgenda({ role: 'profissional' });

      await renderAgenda();

      expect(agenda.listAppointmentsFor).toHaveBeenCalledWith(
        { role: 'profissional', subject: 'admin@clinica.com' },
        expect.anything(),
      );
      expect(agenda.listWaitlistFor).toHaveBeenCalledWith({
        role: 'profissional',
        subject: 'admin@clinica.com',
      });
    });
  });

  describe('Cenário: leitura que falha não derruba a tela', () => {
    it('Dada a grade da empresa indisponível, Então a agenda usa a grade padrão', async () => {
      resetAgenda({ fail: { schedule: 'Sem grade' } });

      await renderAgenda();

      expect(
        screen.getByText('Nenhuma consulta agendada neste mês.'),
      ).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('Dados feriados indisponíveis, Então a grade segue sem eles', async () => {
      resetAgenda({
        appointments: [appointment()],
        fail: { closures: 'Sem feriados' },
      });

      await renderAgenda();

      expect(await screen.findByText(/Maria Souza/)).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('Dada a fila de espera indisponível, Então o painel mostra o erro no lugar da lista', async () => {
      resetAgenda({ fail: { waitlist: 'Fila fora do ar' } });

      await renderAgenda();

      expect(await screen.findByText('Fila fora do ar')).toBeTruthy();
      expect(screen.getByText('Lista de espera')).toBeTruthy();
    });
  });

  describe('Cenário: link do Google Agenda (#217)', () => {
    it('Dado ?consulta=<id>&em=<início>, Quando carregar, Então abre o mês da consulta e os detalhes dela', async () => {
      resetAgenda({ appointments: [appointment()] });

      await renderAgenda(
        `/agenda?consulta=appt-1&em=${new Date(2026, 9, 22, 9).toISOString()}`,
      );

      expect(await screen.findByText('Detalhes da consulta')).toBeTruthy();
      expect(screen.getByText('Troca de bolsa')).toBeTruthy();
    });

    it('Dado o link de uma consulta que não está no período, Então a agenda abre sem detalhes', async () => {
      resetAgenda({ appointments: [] });

      await renderAgenda(
        `/agenda?consulta=appt-9&em=${new Date(2026, 9, 22, 9).toISOString()}`,
      );

      expect(screen.queryByText('Detalhes da consulta')).toBeNull();
    });
  });

  describe('Cenário: navegação enquanto o servidor responde', () => {
    it('Dado o mês aberto, Quando for ao próximo mês, Então a tela fica no lugar, marcada como ocupada, até a resposta', async () => {
      resetAgenda({ appointments: [appointment()] });
      await renderAgenda();
      const label = screen.getByText('Outubro de 2026');

      // A próxima leitura só responde quando a liberarmos.
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      agenda.listAppointmentsFor.mockImplementation(async () => {
        await gate;
        return [];
      });
      await click(screen.getByLabelText('Próximo mês'));

      expect(agenda.pushed.at(-1)).toBe('/agenda?dia=2026-11-01');
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(screen.getByText(/Maria Souza/)).toBeTruthy();
      expect(label.textContent).toBe('Outubro de 2026');

      release();
      await waitFor(() => expect(label.textContent).toBe('Novembro de 2026'));
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    });

    it('Dada a semana aberta, Quando for à semana seguinte, Então as colunas esvaziam, ocupadas, sem consultas da semana anterior', async () => {
      resetAgenda({
        scheduleConfig: DEFAULT_TEST_SCHEDULE_CONFIG,
        appointments: [appointment()],
      });
      await renderAgenda('/agenda?visao=semana&dia=2026-10-18');
      expect(await screen.findByText(/Maria Souza/)).toBeTruthy();

      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      agenda.listAppointmentsFor.mockImplementation(async () => {
        await gate;
        return [];
      });
      await click(screen.getByLabelText('Próxima semana'));

      expect(screen.queryByText(/Maria Souza/)).toBeNull();
      expect(screen.queryByText(/Nenhuma consulta/)).toBeNull();
      expect(document.querySelectorAll('[data-week-day]')).toHaveLength(7);

      release();
      await waitFor(() =>
        expect(screen.getByText(/25 a 31 de outubro de 2026/)).toBeTruthy(),
      );
    });
  });

  describe('Cenário: celular (#582)', () => {
    const stubMatchMedia = (matches: boolean) =>
      vi.stubGlobal('matchMedia', () => ({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

    it('Dado o celular, Quando abrir a agenda, Então Mês e Dia, sem Semana, e o mês compacto', async () => {
      stubMatchMedia(true);
      resetAgenda({ appointments: [appointment()] });

      await renderAgenda();

      expect(screen.getByRole('button', { name: 'Mês' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Dia' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Semana' })).toBeNull();
      expect(document.querySelector('[data-mobile-month]')).not.toBeNull();
      expect(document.querySelector('[data-calendar-day]')).toBeNull();
    });

    it('Dado o celular com a semana na URL, Quando carregar, Então troca para o Dia sem criar entrada no histórico', async () => {
      stubMatchMedia(true);
      resetAgenda();

      await renderAgenda('/agenda?visao=semana&dia=2026-10-18');

      await waitFor(() =>
        expect(agenda.replaced.at(-1)).toBe('/agenda?visao=dia&dia=2026-10-18'),
      );
      expect(agenda.pushed).toEqual([]);
    });

    it('Dado o desktop, Quando abrir a agenda, Então Mês, Semana e Dia e a grade de chips', async () => {
      stubMatchMedia(false);
      resetAgenda({ appointments: [appointment()] });

      await renderAgenda();

      expect(screen.getByRole('button', { name: 'Semana' })).toBeTruthy();
      expect(document.querySelector('[data-calendar-day]')).not.toBeNull();
      expect(document.querySelector('[data-mobile-month]')).toBeNull();
    });
  });

  describe('Cenário: HTML do servidor, antes de hidratar', () => {
    it('Dada a tela renderizada no servidor, Então traz as duas versões do mês, com a que não serve escondida por CSS, e o botão de nova consulta desabilitado', () => {
      const html = renderToString(
        <ToastProvider>
          <AgendaScreen
            query={{
              view: 'month',
              anchor: '2026-10-15',
              statuses: ['scheduled'],
              professionalId: '',
            }}
            entry={{ recall: null, consultation: null }}
            appointments={[appointment()]}
            appointmentsError={null}
            statusCounts={{ ...DEFAULT_COUNTS, scheduled: 1 }}
            countsError={null}
            professionals={[]}
            professionalsError={null}
            scheduleConfig={DEFAULT_TEST_SCHEDULE_CONFIG}
            closures={[]}
            waitlist={[]}
            waitlistError={null}
          />
        </ToastProvider>,
      );

      expect(html).toContain('data-mobile-month');
      expect(html).toContain('data-calendar-day');
      expect(html).toContain('md:hidden');
      expect(html).toContain('hidden md:block');
      // O botão Semana vem escondido abaixo de `md`, não ausente.
      expect(html).toContain('hidden md:inline-flex');
      expect(html).toMatch(/<button[^>]*disabled[^>]*>\+ Nova consulta/);
      expect(html).toContain('Maria Souza');
    });
  });
});

describe('Feature: Cliques seguidos em «próximo» enquanto o servidor responde (#551)', () => {
  it('Dado o mês de outubro, Quando tocar duas vezes em «Próximo mês» antes da resposta, Então a agenda abre dois meses à frente', async () => {
    resetAgenda();
    await renderAgenda();
    const next = await screen.findByLabelText('Próximo mês');

    await act(async () => {
      fireEvent.click(next);
      fireEvent.click(next);
    });

    await waitFor(() =>
      expect(agenda.pushed.at(-1)).toBe('/agenda?dia=2026-12-01'),
    );
    expect(await screen.findByText('Dezembro de 2026')).toBeTruthy();
  });

  it('Dado o padrão, Quando desmarcar dois chips antes da resposta, Então os dois ficam desmarcados na URL', async () => {
    resetAgenda({ counts: { ...DEFAULT_COUNTS, scheduled: 3, completed: 1 } });
    await renderAgenda();
    const scheduled = await screen.findByRole('button', {
      name: 'Agendada, 3 consultas',
    });
    const completed = screen.getByRole('button', {
      name: 'Concluída, 1 consulta',
    });

    await act(async () => {
      fireEvent.click(scheduled);
      fireEvent.click(completed);
    });

    expect(agenda.replaced.at(-1)).toBe('/agenda?status=confirmed%2Cno_show');
  });

  it('Dado o profissional escolhido, Quando tocar em «Próximo mês» antes da resposta, Então o profissional continua no endereço', async () => {
    resetAgenda({
      professionals: [{ id: 'prof-1', fullName: 'Dra. Ana', active: true }],
    });
    await renderAgenda();
    const filter = await screen.findByLabelText('Filtrar por profissional');
    const next = screen.getByLabelText('Próximo mês');

    await act(async () => {
      fireEvent.change(filter, { target: { value: 'prof-1' } });
      fireEvent.click(next);
    });

    expect(agenda.pushed.at(-1)).toBe(
      '/agenda?dia=2026-11-01&profissional=prof-1',
    );
  });
});
