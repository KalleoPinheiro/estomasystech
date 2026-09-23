// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { AppointmentDetail } from '@/app/(staff)/agenda/appointment-detail';
import { AppointmentForm } from '@/app/(staff)/agenda/appointment-form';
import { CalendarGrid, dayKey } from '@/app/(staff)/agenda/calendar-grid';
import AgendaPage from '@/app/(staff)/agenda/page';
import { ApiError } from '@/lib/client';
import type {
  AppointmentDto,
  PatientDto,
  ProfessionalDto,
  ScheduleClosureDto,
} from '@/lib/dto';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/agenda',
}));

function jsonResponse(
  success: boolean,
  data: unknown,
  error: string | null = null,
) {
  return {
    ok: success,
    json: async () => ({ success, data, error }),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const patientFixture: PatientDto = {
  id: 'pat-1',
  fullName: 'Maria Souza',
  email: 'maria@example.com',
  phone: '11999999999',
  birthDate: null,
  notes: null,
  referredByPartnerId: null,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const professionalFixture: ProfessionalDto = {
  id: 'prof-1',
  fullName: 'Dra. Ana',
  registry: 'COREN-123',
  commissionType: 'percentage',
  commissionPct: 10,
  commissionFixedCents: null,
  active: true,
};

const appointmentFixture: AppointmentDto = {
  id: 'appt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  procedure: 'Troca de bolsa',
  priceCents: 12000,
  notes: 'Observação clínica',
  status: 'scheduled',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
};

// Fixture com data fixa para os cenários do CalendarGrid, que renderizam o mês
// de julho/2026 — fixture relativa a "agora" some da grade em qualquer outro mês.
const julyAppointmentFixture: AppointmentDto = {
  ...appointmentFixture,
  startsAt: new Date(2026, 6, 15, 9).toISOString(),
  endsAt: new Date(2026, 6, 15, 10).toISOString(),
  procedure: 'Troca de bolsa',
  priceCents: 12000,
  notes: 'Observação clínica',
  status: 'scheduled',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
};

interface AgendaFetchOptions {
  appointments?: AppointmentDto[];
  patients?: PatientDto[];
  professionals?: ProfessionalDto[];
  scheduleConfig?: {
    weekdays: number[];
    startHour: number;
    endHour: number;
    minGapMinutes: number;
  };
  closures?: ScheduleClosureDto[];
  appointmentsPostStatus?: number;
  appointmentsPostError?: string;
}

const DEFAULT_TEST_SCHEDULE_CONFIG = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
  minGapMinutes: 15,
};

function mockAgendaFetch(options: AgendaFetchOptions = {}) {
  const {
    appointments = [],
    patients = [patientFixture],
    professionals = [],
    scheduleConfig = DEFAULT_TEST_SCHEDULE_CONFIG,
    closures = [],
    appointmentsPostStatus,
    appointmentsPostError,
  } = options;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url.startsWith('/api/appointments/recurring') && method === 'POST') {
        return jsonResponse(true, {
          created: [appointmentFixture],
          skipped: [],
        });
      }
      if (url.startsWith('/api/appointments/') && method === 'PATCH') {
        return jsonResponse(true, appointmentFixture);
      }
      if (url.startsWith('/api/appointments') && method === 'POST') {
        if (appointmentsPostStatus) {
          return {
            ok: false,
            status: appointmentsPostStatus,
            json: async () => ({
              success: false,
              data: null,
              error: appointmentsPostError ?? 'Erro ao agendar',
            }),
          };
        }
        return jsonResponse(true, appointmentFixture);
      }
      if (url.startsWith('/api/appointments')) {
        return jsonResponse(true, appointments);
      }
      if (url.startsWith('/api/patients')) {
        return jsonResponse(true, patients);
      }
      if (url.startsWith('/api/professionals')) {
        return jsonResponse(true, professionals);
      }
      if (url.startsWith('/api/procedures')) {
        return jsonResponse(true, []);
      }
      if (url.startsWith('/api/waitlist')) {
        return jsonResponse(true, []);
      }
      if (url.startsWith('/api/settings/schedule/closures')) {
        return jsonResponse(true, closures);
      }
      if (url.startsWith('/api/settings/schedule')) {
        return jsonResponse(true, { config: scheduleConfig, isDefault: false });
      }
      throw new Error(`URL não mapeada no mock: ${method} ${url}`);
    }),
  );
}

describe('Feature: Página de agenda', () => {
  describe('Cenário: carregamento inicial', () => {
    it('Dado que as consultas ainda não chegaram, Quando renderizar, Então exibe indicador de carregamento', () => {
      mockAgendaFetch();
      renderWithToast(<AgendaPage />);

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
    });
  });

  describe('Cenário: erro ao carregar consultas', () => {
    it('Dado falha na API de consultas, Quando renderizar, Então exibe alerta de erro', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url.startsWith('/api/appointments')) {
            return jsonResponse(false, null, 'Erro ao buscar consultas');
          }
          return jsonResponse(true, []);
        }),
      );
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Erro ao buscar consultas'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: grade renderizada com consultas', () => {
    it('Dado consultas do mês, Quando renderizar, Então exibe a grade do calendário', async () => {
      mockAgendaFetch({ appointments: [appointmentFixture] });
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      });
      expect(screen.getByText(/Maria Souza/)).toBeInTheDocument();
    });

    it('Dado profissionais cadastrados, Quando renderizar, Então exibe o filtro de profissionais', async () => {
      mockAgendaFetch({ professionals: [professionalFixture] });
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.getByText('Todos os profissionais')).toBeInTheDocument();
      });
      expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    });
  });

  describe('Cenário: criar nova consulta', () => {
    it("Dado clique em 'Nova consulta', Quando o formulário é submetido, Então chama a API de criação", async () => {
      mockAgendaFetch();
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('+ Nova consulta'));

      await waitFor(() => {
        expect(screen.getByText('Nova consulta')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });

      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/appointments',
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });

    it("Dado sucesso ao criar consulta única, Quando submetido, Então exibe toast de sucesso 'Consulta criada'", async () => {
      mockAgendaFetch();
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('+ Nova consulta'));

      await waitFor(() => {
        expect(screen.getByText('Nova consulta')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });

      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        expect(screen.getByText('Consulta criada')).toBeInTheDocument();
      });
    });

    it('Dado falha ao criar consulta única, Quando acionado, Então exibe toast de erro e modal continua aberto', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';

          if (url.startsWith('/api/appointments') && method === 'POST') {
            throw new Error('Erro ao criar consulta');
          }
          if (url.startsWith('/api/appointments'))
            return jsonResponse(true, []);
          if (url.startsWith('/api/patients'))
            return jsonResponse(true, [patientFixture]);
          if (url.startsWith('/api/professionals'))
            return jsonResponse(true, []);
          if (url.startsWith('/api/procedures')) return jsonResponse(true, []);
          if (url.startsWith('/api/waitlist')) return jsonResponse(true, []);
          throw new Error(`URL não mapeada no mock: ${method} ${url}`);
        }),
      );
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('+ Nova consulta'));

      await waitFor(() => {
        expect(screen.getByText('Nova consulta')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });

      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        expect(screen.getByText('Erro ao criar consulta')).toBeInTheDocument();
      });
      // Modal continua aberto após erro
      expect(screen.getByText('Nova consulta')).toBeInTheDocument();
    });
  });

  describe('Cenário: abrir detalhes de uma consulta pelo calendário', () => {
    it('Dado clique em uma consulta na grade, Quando acionado, Então abre o modal de detalhes', async () => {
      mockAgendaFetch({ appointments: [appointmentFixture] });
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.getByText(/Maria Souza/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/Maria Souza/));

      await waitFor(() => {
        expect(screen.getByText('Detalhes da consulta')).toBeInTheDocument();
      });
      expect(screen.getByText('Troca de bolsa')).toBeInTheDocument();
    });
  });

  describe('Cenário: filtro por profissional', () => {
    it('Dado seleção de um profissional no filtro, Quando alterado, Então refaz a busca das consultas com o profissional selecionado', async () => {
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (url.startsWith('/api/appointments'))
            return jsonResponse(true, []);
          if (url.startsWith('/api/patients'))
            return jsonResponse(true, [patientFixture]);
          if (url.startsWith('/api/professionals'))
            return jsonResponse(true, [professionalFixture]);
          if (url.startsWith('/api/procedures')) return jsonResponse(true, []);
          if (url.startsWith('/api/waitlist')) return jsonResponse(true, []);
          throw new Error(`URL não mapeada no mock: ${method} ${url}`);
        },
      );
      vi.stubGlobal('fetch', fetchMock);
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByDisplayValue('Todos os profissionais'), {
        target: { value: 'prof-1' },
      });

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([input]) =>
            (typeof input === 'string' ? input : input.toString()).includes(
              'professionalId=prof-1',
            ),
          ),
        ).toBe(true);
      });
    });
  });

  describe('Cenário: navegação por mês', () => {
    it('Dado clique nas setas de navegação, Quando acionadas, Então o mês exibido muda', async () => {
      mockAgendaFetch();
      const { container } = renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      });
      const monthLabelEl = container.querySelector('.min-w-48') as HTMLElement;
      const initialText = monthLabelEl.textContent;

      fireEvent.click(screen.getByLabelText('Próximo mês'));
      expect(monthLabelEl.textContent).not.toBe(initialText);

      fireEvent.click(screen.getByLabelText('Mês anterior'));
      fireEvent.click(screen.getByLabelText('Mês anterior'));
      expect(monthLabelEl.textContent).not.toBe(initialText);
    });

    it('Dado o mês atual, Quando renderizar, Então só a primeira letra do rótulo é maiúscula (AGENDA-04)', async () => {
      mockAgendaFetch();
      const { container } = renderWithToast(<AgendaPage />);
      await waitFor(() => {
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      });

      const monthLabelEl = container.querySelector('.min-w-48') as HTMLElement;
      const raw = new Date().toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      });
      const expected = raw.charAt(0).toUpperCase() + raw.slice(1);
      expect(monthLabelEl.textContent).toBe(expected);
      expect(monthLabelEl.className).not.toContain('capitalize');
    });

    it('Dado profissionais cadastrados, Quando renderizar, Então o filtro tem largura limitada (AGENDA-04)', async () => {
      mockAgendaFetch({ professionals: [professionalFixture] });
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
      });
      expect(screen.getByDisplayValue('Todos os profissionais')).toHaveClass(
        'max-w-56',
      );
    });
  });

  describe('Cenário: legenda de status e mês vazio (AGENDA-03)', () => {
    it('Dado a grade renderizada, Quando exibir, Então mostra a legenda com os 5 status', async () => {
      mockAgendaFetch();
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Agendada')).toBeInTheDocument();
      expect(screen.getByText('Confirmada')).toBeInTheDocument();
      expect(screen.getByText('Concluída')).toBeInTheDocument();
      expect(screen.getByText('Cancelada')).toBeInTheDocument();
      expect(screen.getByText('Faltou')).toBeInTheDocument();
    });

    it('Dado mês sem nenhuma consulta, Quando renderizar, Então exibe mensagem de estado vazio', async () => {
      mockAgendaFetch({ appointments: [] });
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Nenhuma consulta agendada neste mês.'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: criar série recorrente de consultas', () => {
    it('Dado seleção de repetição semanal sem sessões puladas, Quando submetido, Então exibe aviso de série criada', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (
            url.startsWith('/api/appointments/recurring') &&
            method === 'POST'
          ) {
            return jsonResponse(true, {
              created: [
                appointmentFixture,
                { ...appointmentFixture, id: 'appt-2' },
              ],
              skipped: [],
            });
          }
          if (url.startsWith('/api/appointments'))
            return jsonResponse(true, []);
          if (url.startsWith('/api/patients'))
            return jsonResponse(true, [patientFixture]);
          if (url.startsWith('/api/professionals'))
            return jsonResponse(true, []);
          if (url.startsWith('/api/procedures')) return jsonResponse(true, []);
          if (url.startsWith('/api/waitlist')) return jsonResponse(true, []);
          throw new Error(`URL não mapeada no mock: ${method} ${url}`);
        }),
      );
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('+ Nova consulta'));
      await waitFor(() =>
        expect(screen.getByText('Nova consulta')).toBeInTheDocument(),
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Repetição/), {
        target: { value: '4' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        const alert = screen.getByRole('status');
        expect(alert).toHaveTextContent('Série criada: 2 sessões.');
      });
    });

    it('Dado série recorrente com sessões puladas por conflito, Quando submetido, Então exibe aviso com as datas puladas', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (
            url.startsWith('/api/appointments/recurring') &&
            method === 'POST'
          ) {
            return jsonResponse(true, {
              created: [appointmentFixture],
              skipped: [
                {
                  startsAt: '2026-07-27T12:00:00.000Z',
                  reason: 'Conflito de horário',
                },
              ],
            });
          }
          if (url.startsWith('/api/appointments'))
            return jsonResponse(true, []);
          if (url.startsWith('/api/patients'))
            return jsonResponse(true, [patientFixture]);
          if (url.startsWith('/api/professionals'))
            return jsonResponse(true, []);
          if (url.startsWith('/api/procedures')) return jsonResponse(true, []);
          if (url.startsWith('/api/waitlist')) return jsonResponse(true, []);
          throw new Error(`URL não mapeada no mock: ${method} ${url}`);
        }),
      );
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('+ Nova consulta'));
      await waitFor(() =>
        expect(screen.getByText('Nova consulta')).toBeInTheDocument(),
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Repetição/), {
        target: { value: '4' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(
          /Série criada: 1 sessão\(ões\); 1 pulada\(s\)/,
        );
      });
    });

    it("Dado aviso de série exibido, Quando clicar em 'Dispensar', Então o alerta some (AGENDA-07)", async () => {
      mockAgendaFetch();
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('+ Nova consulta'));
      await waitFor(() =>
        expect(screen.getByText('Nova consulta')).toBeInTheDocument(),
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Repetição/), {
        target: { value: '4' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        expect(screen.getByText(/Série criada/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Dispensar'));

      expect(screen.queryByText(/Série criada/)).not.toBeInTheDocument();
    });
  });

  describe('Cenário: executar ação sobre consulta selecionada', () => {
    it('Dado clique em Confirmar no modal de detalhes, Quando acionado, Então envia PATCH com a ação e fecha o modal', async () => {
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (url.startsWith('/api/appointments/') && method === 'PATCH') {
            return jsonResponse(true, {
              ...appointmentFixture,
              status: 'confirmed',
            });
          }
          if (url.startsWith('/api/appointments'))
            return jsonResponse(true, [appointmentFixture]);
          if (url.startsWith('/api/patients'))
            return jsonResponse(true, [patientFixture]);
          if (url.startsWith('/api/professionals'))
            return jsonResponse(true, []);
          if (url.startsWith('/api/procedures')) return jsonResponse(true, []);
          if (url.startsWith('/api/waitlist')) return jsonResponse(true, []);
          throw new Error(`URL não mapeada no mock: ${method} ${url}`);
        },
      );
      vi.stubGlobal('fetch', fetchMock);
      renderWithToast(<AgendaPage />);

      await waitFor(() =>
        expect(screen.getByText(/Maria Souza/)).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText(/Maria Souza/));
      await waitFor(() =>
        expect(screen.getByText('Detalhes da consulta')).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByText('Confirmar'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/appointments/appt-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ action: 'confirm' }),
          }),
        );
      });
      await waitFor(() => {
        expect(
          screen.queryByText('Detalhes da consulta'),
        ).not.toBeInTheDocument();
      });
    });

    it('Dado clique em Concluir + faturar no modal de detalhes, Quando acionado, Então envia PATCH com o retorno programado', async () => {
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (url.startsWith('/api/appointments/') && method === 'PATCH') {
            return jsonResponse(true, {
              ...appointmentFixture,
              status: 'completed',
            });
          }
          if (url.startsWith('/api/appointments'))
            return jsonResponse(true, [appointmentFixture]);
          if (url.startsWith('/api/patients'))
            return jsonResponse(true, [patientFixture]);
          if (url.startsWith('/api/professionals'))
            return jsonResponse(true, []);
          if (url.startsWith('/api/procedures')) return jsonResponse(true, []);
          if (url.startsWith('/api/waitlist')) return jsonResponse(true, []);
          throw new Error(`URL não mapeada no mock: ${method} ${url}`);
        },
      );
      vi.stubGlobal('fetch', fetchMock);
      renderWithToast(<AgendaPage />);

      await waitFor(() =>
        expect(screen.getByText(/Maria Souza/)).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText(/Maria Souza/));
      await waitFor(() =>
        expect(screen.getByText('Detalhes da consulta')).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByText('Concluir + faturar'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/appointments/appt-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ action: 'complete', followUpInDays: 30 }),
          }),
        );
      });
    });

    it('Dado remarcação confirmada no modal de detalhes, Quando acionada, Então envia PATCH com a ação de remarcação', async () => {
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (url.startsWith('/api/appointments/') && method === 'PATCH') {
            return jsonResponse(true, appointmentFixture);
          }
          if (url.startsWith('/api/appointments'))
            return jsonResponse(true, [appointmentFixture]);
          if (url.startsWith('/api/patients'))
            return jsonResponse(true, [patientFixture]);
          if (url.startsWith('/api/professionals'))
            return jsonResponse(true, []);
          if (url.startsWith('/api/procedures')) return jsonResponse(true, []);
          if (url.startsWith('/api/waitlist')) return jsonResponse(true, []);
          throw new Error(`URL não mapeada no mock: ${method} ${url}`);
        },
      );
      vi.stubGlobal('fetch', fetchMock);
      renderWithToast(<AgendaPage />);

      await waitFor(() =>
        expect(screen.getByText(/Maria Souza/)).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText(/Maria Souza/));
      await waitFor(() =>
        expect(screen.getByText('Detalhes da consulta')).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByText('Remarcar'));
      await waitFor(() =>
        expect(screen.getByText('Confirmar remarcação')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText('Confirmar remarcação'));

      await waitFor(() => {
        const patchCall = fetchMock.mock.calls.find(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
        );
        expect(patchCall).toBeDefined();
        const body = JSON.parse(
          ((patchCall?.[1] as RequestInit | undefined)?.body as string) ?? '{}',
        ) as { action: string };
        expect(body.action).toBe('reschedule');
      });
    });
  });

  describe('Cenário: fechar modais sem executar ação', () => {
    it('Dado modal de nova consulta aberto, Quando fechado sem submeter, Então o modal desaparece', async () => {
      mockAgendaFetch({ professionals: [professionalFixture] });
      renderWithToast(<AgendaPage />);

      await waitFor(() =>
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText('+ Nova consulta'));
      await waitFor(() =>
        expect(screen.getByText('Nova consulta')).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      await waitFor(() => {
        expect(screen.queryByText('Nova consulta')).not.toBeInTheDocument();
      });
    });

    it('Dado clique em um dia vazio da grade, Quando acionado, Então abre o modal de nova consulta para aquele dia', async () => {
      mockAgendaFetch();
      const { container } = renderWithToast(<AgendaPage />);

      await waitFor(() =>
        expect(screen.queryByText('Carregando…')).not.toBeInTheDocument(),
      );
      const dayCells = container.querySelectorAll('.cursor-pointer');
      fireEvent.click(dayCells[10]);

      await waitFor(() => {
        expect(screen.getByText('Nova consulta')).toBeInTheDocument();
      });
    });

    it('Dado modal de detalhes aberto, Quando fechado sem executar ação, Então o modal desaparece', async () => {
      mockAgendaFetch({ appointments: [appointmentFixture] });
      renderWithToast(<AgendaPage />);

      await waitFor(() =>
        expect(screen.getByText(/Maria Souza/)).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText(/Maria Souza/));
      await waitFor(() =>
        expect(screen.getByText('Detalhes da consulta')).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      await waitFor(() => {
        expect(
          screen.queryByText('Detalhes da consulta'),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Cenário: recall de um clique via parâmetros de URL', () => {
    afterEach(() => {
      window.history.pushState({}, '', '/');
    });

    it('Dado parâmetros completos de recall na URL, Quando a página carrega, Então abre o formulário pré-preenchido', async () => {
      window.history.pushState(
        {},
        '',
        '/agenda?followUpId=fu-1&patientId=pat-1&procedure=Troca+de+curativo',
      );
      mockAgendaFetch();
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.getByText('Nova consulta')).toBeInTheDocument();
      });
      expect(screen.getByDisplayValue('Troca de curativo')).toBeInTheDocument();
      expect(screen.getByLabelText(/Paciente/)).toHaveValue('pat-1');
    });

    it('Dado apenas o followUpId presente na URL, Quando a página carrega, Então abre o formulário sem paciente ou procedimento pré-selecionados', async () => {
      window.history.pushState({}, '', '/agenda?followUpId=fu-1');
      mockAgendaFetch();
      renderWithToast(<AgendaPage />);

      await waitFor(() => {
        expect(screen.getByText('Nova consulta')).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/Procedimento \*/)).toHaveValue('');
      expect(screen.getByLabelText(/Paciente/)).toHaveValue('');
    });
  });
});

describe('Feature: Formulário de nova consulta', () => {
  describe('Cenário: submissão válida', () => {
    it('Dado dados preenchidos, Quando submeter, Então chama onSubmit com os valores do formulário', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      mockAgendaFetch();
      render(
        <AppointmentForm
          patients={[patientFixture]}
          professionals={[professionalFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Avaliação de ferida' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '150.5' },
      });

      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            patientId: 'pat-1',
            procedure: 'Avaliação de ferida',
            price: '150.5',
            occurrences: 1,
          }),
        );
      });
    });

    it('Dado erro ao submeter, Quando onSubmit rejeita, Então exibe alerta de erro', async () => {
      const onSubmit = vi
        .fn()
        .mockRejectedValue(new Error('Conflito de horário'));
      mockAgendaFetch();
      render(
        <AppointmentForm
          patients={[patientFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });

      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        expect(screen.getByText('Conflito de horário')).toBeInTheDocument();
      });
    });

    it('Dado seleção de procedimento do catálogo, Quando escolhido, Então preenche nome, preço e duração', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url.startsWith('/api/procedures')) {
            return jsonResponse(true, [
              {
                id: 'proc-1',
                name: 'Curativo simples',
                priceCents: 8000,
                durationMinutes: 45,
                active: true,
              },
            ]);
          }
          return jsonResponse(true, []);
        }),
      );
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <AppointmentForm
          patients={[patientFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={onSubmit}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/Curativo simples/)).toBeInTheDocument();
      });
      fireEvent.change(screen.getByLabelText(/Procedimento do catálogo/), {
        target: { value: 'proc-1' },
      });

      expect(screen.getByDisplayValue('Curativo simples')).toBeInTheDocument();
      expect(screen.getByDisplayValue('80')).toBeInTheDocument();
    });

    it('Dado limpeza da seleção do catálogo, Quando revertido para vazio, Então mantém os valores digitados manualmente', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url.startsWith('/api/procedures')) {
            return jsonResponse(true, [
              {
                id: 'proc-1',
                name: 'Curativo simples',
                priceCents: 8000,
                durationMinutes: 45,
                active: true,
              },
            ]);
          }
          return jsonResponse(true, []);
        }),
      );
      render(
        <AppointmentForm
          patients={[patientFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/Curativo simples/)).toBeInTheDocument();
      });
      fireEvent.change(screen.getByLabelText(/Procedimento do catálogo/), {
        target: { value: 'proc-1' },
      });
      expect(screen.getByDisplayValue('Curativo simples')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Procedimento do catálogo/), {
        target: { value: '' },
      });

      expect(screen.getByDisplayValue('Curativo simples')).toBeInTheDocument();
      expect(screen.getByDisplayValue('80')).toBeInTheDocument();
    });
  });

  describe('Cenário: ausência de data padrão', () => {
    it('Dado formulário sem data padrão informada, Quando renderizar, Então usa a data atual como valor inicial', () => {
      render(
        <AppointmentForm
          patients={[patientFixture]}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.getByLabelText(/Data \*/)).toHaveValue(dayKey(new Date()));
    });
  });

  describe('Cenário: repetição, profissional e demais campos', () => {
    it('Dado seleção de repetição semanal, Quando submetido, Então envia o número de ocorrências escolhido', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      mockAgendaFetch();
      render(
        <AppointmentForm
          patients={[patientFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Repetição/), {
        target: { value: '4' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ occurrences: 4 }),
        );
      });
    });

    it('Dado seleção de profissional, Quando submetido, Então inclui o profissional nos valores enviados', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      mockAgendaFetch();
      render(
        <AppointmentForm
          patients={[patientFixture]}
          professionals={[professionalFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Profissional/), {
        target: { value: 'prof-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ professionalId: 'prof-1' }),
        );
      });
    });

    it('Dado alteração de data, horário, duração e observações, Quando submetido, Então envia os novos valores', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      mockAgendaFetch();
      render(
        <AppointmentForm
          patients={[patientFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Data \*/), {
        target: { value: '2026-08-01' },
      });
      fireEvent.change(screen.getByLabelText(/Início \*/), {
        target: { value: '10:30' },
      });
      fireEvent.change(screen.getByLabelText(/Duração \*/), {
        target: { value: '90' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });
      fireEvent.change(screen.getByLabelText(/Observações/), {
        target: { value: 'Paciente ansioso' },
      });
      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            date: '2026-08-01',
            startTime: '10:30',
            durationMinutes: 90,
            notes: 'Paciente ansioso',
          }),
        );
      });
    });
  });

  describe('Cenário: erro não padronizado ao agendar', () => {
    it('Dado onSubmit rejeitando com valor que não é Error, Quando submetido, Então exibe mensagem padrão de erro', async () => {
      const onSubmit = vi.fn().mockRejectedValue('falha inesperada');
      mockAgendaFetch();
      render(
        <AppointmentForm
          patients={[patientFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        expect(
          screen.getByText('Erro ao agendar consulta'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: aviso de regra vem da configuração real (AGENDA-02)', () => {
    it('Dado uma ScheduleConfig custom, Quando renderizar, Então o aviso reflete a config real, não a constante fixa', async () => {
      mockAgendaFetch({
        scheduleConfig: {
          weekdays: [2, 4],
          startHour: 9,
          endHour: 17,
          minGapMinutes: 30,
        },
      });
      render(
        <AppointmentForm
          patients={[patientFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText(/terça, quinta, das 09:00 às 17:00/),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText(/intervalo mínimo de 30 minutos/),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: erro 409 distinto de 400 (AGENDA-05)', () => {
    it('Dado erro 409 (conflito), Quando submetido, Então o alerta usa variante warning', async () => {
      const onSubmit = vi
        .fn()
        .mockRejectedValue(
          new ApiError(
            'Horário indisponível: conflito com outra consulta',
            409,
          ),
        );
      mockAgendaFetch();
      render(
        <AppointmentForm
          patients={[patientFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Horário indisponível');
        expect(alert).toHaveClass('sv-alert--warning');
      });
    });

    it('Dado erro 400 (validação), Quando submetido, Então o alerta mantém variante danger (role alert)', async () => {
      const onSubmit = vi
        .fn()
        .mockRejectedValue(new ApiError('Dados inválidos', 400));
      mockAgendaFetch();
      render(
        <AppointmentForm
          patients={[patientFixture]}
          defaultDate={new Date(2026, 6, 19)}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Paciente/), {
        target: { value: 'pat-1' },
      });
      fireEvent.change(screen.getByLabelText(/Procedimento \*/), {
        target: { value: 'Curativo' },
      });
      fireEvent.change(screen.getByLabelText(/Valor/), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByText('Agendar consulta'));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Dados inválidos');
        expect(alert).toHaveClass('sv-alert--danger');
      });
    });
  });
});

describe('Feature: Detalhe de consulta', () => {
  describe('Cenário: ações disponíveis por status', () => {
    it('Dado consulta agendada, Quando renderizar, Então exibe as quatro ações disponíveis', () => {
      render(
        <AppointmentDetail
          appointment={appointmentFixture}
          onAction={vi.fn().mockResolvedValue(undefined)}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.getByText('Confirmar')).toBeInTheDocument();
      expect(screen.getByText('Concluir + faturar')).toBeInTheDocument();
      expect(screen.getByText('Registrar falta')).toBeInTheDocument();
      expect(screen.getByText('Cancelar')).toBeInTheDocument();
    });

    it('Dado consulta agendada, Quando renderizar, Então cada ação leva a sua cor semântica', () => {
      render(
        <AppointmentDetail
          appointment={appointmentFixture}
          onAction={vi.fn().mockResolvedValue(undefined)}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      // A cor distingue a ação destrutiva da confirmação — sem ela as quatro
      // ficam visualmente idênticas (a classe já vazou como string literal uma vez).
      expect(screen.getByText('Confirmar').className).toContain(
        'bg-accent-ink',
      );
      expect(screen.getByText('Concluir + faturar').className).toContain(
        'bg-success',
      );
      expect(screen.getByText('Registrar falta').className).toContain(
        'bg-warning',
      );
      expect(screen.getByText('Cancelar').className).toContain('bg-danger');
    });

    it('Dado consulta confirmada, Quando renderizar, Então não exibe a ação de confirmar', () => {
      render(
        <AppointmentDetail
          appointment={{ ...appointmentFixture, status: 'confirmed' }}
          onAction={vi.fn().mockResolvedValue(undefined)}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.queryByText('Confirmar')).not.toBeInTheDocument();
      expect(screen.getByText('Concluir + faturar')).toBeInTheDocument();
    });

    it('Dado consulta concluída, Quando renderizar, Então não exibe nenhuma ação', () => {
      render(
        <AppointmentDetail
          appointment={{ ...appointmentFixture, status: 'completed' }}
          onAction={vi.fn().mockResolvedValue(undefined)}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.queryByText('Confirmar')).not.toBeInTheDocument();
      expect(screen.queryByText('Remarcar')).not.toBeInTheDocument();
    });
  });

  describe('Cenário: registro de cancelamento', () => {
    it('Dado consulta cancelada pelo paciente no portal, Quando renderizar, Então mostra quem cancelou, quando e o motivo', () => {
      render(
        <AppointmentDetail
          appointment={{
            ...appointmentFixture,
            status: 'cancelled',
            cancelledBy: 'patient',
            cancelledAt: '2026-07-18T10:00:00.000Z',
            cancelReason: 'Viagem',
          }}
          onAction={vi.fn().mockResolvedValue(undefined)}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.getByText(/pelo paciente no portal/)).toHaveTextContent(
        /— Viagem/,
      );
    });

    it('Dado consulta cancelada pela clínica sem motivo, Quando renderizar, Então mostra a origem sem motivo', () => {
      render(
        <AppointmentDetail
          appointment={{
            ...appointmentFixture,
            status: 'cancelled',
            cancelledBy: 'clinic',
            cancelledAt: '2026-07-18T10:00:00.000Z',
          }}
          onAction={vi.fn().mockResolvedValue(undefined)}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.getByText(/pela clínica/)).not.toHaveTextContent('—');
    });
  });

  describe('Cenário: acionar ação', () => {
    it("Dado clique em Confirmar, Quando acionado, Então chama onAction com 'confirm'", async () => {
      const onAction = vi.fn().mockResolvedValue(undefined);
      render(
        <AppointmentDetail
          appointment={appointmentFixture}
          onAction={onAction}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.click(screen.getByText('Confirmar'));

      await waitFor(() => {
        expect(onAction).toHaveBeenCalledWith('confirm', null);
      });
    });

    it('Dado clique em Concluir + faturar com retorno selecionado, Quando acionado, Então chama onAction com dias de retorno', async () => {
      const onAction = vi.fn().mockResolvedValue(undefined);
      render(
        <AppointmentDetail
          appointment={appointmentFixture}
          onAction={onAction}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.click(screen.getByText('Concluir + faturar'));

      await waitFor(() => {
        expect(onAction).toHaveBeenCalledWith('complete', 30);
      });
    });

    it('Dado erro na ação, Quando onAction rejeita, Então exibe alerta de erro', async () => {
      const onAction = vi
        .fn()
        .mockRejectedValue(new Error('Erro ao atualizar consulta'));
      render(
        <AppointmentDetail
          appointment={appointmentFixture}
          onAction={onAction}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(screen.getByText('Confirmar cancelamento'));

      await waitFor(() => {
        expect(
          screen.getByText('Erro ao atualizar consulta'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: remarcação', () => {
    it('Dado clique em Remarcar e confirmação, Quando acionado, Então chama onReschedule com novas datas', async () => {
      const onReschedule = vi.fn().mockResolvedValue(undefined);
      render(
        <AppointmentDetail
          appointment={appointmentFixture}
          onAction={vi.fn().mockResolvedValue(undefined)}
          onReschedule={onReschedule}
        />,
      );

      fireEvent.click(screen.getByText('Remarcar'));

      await waitFor(() => {
        expect(screen.getByText('Confirmar remarcação')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Confirmar remarcação'));

      await waitFor(() => {
        expect(onReschedule).toHaveBeenCalledTimes(1);
      });
    });

    it('Dado alteração de data e horário no formulário de remarcação, Quando confirmado, Então chama onReschedule com os novos valores', async () => {
      const onReschedule = vi.fn().mockResolvedValue(undefined);
      render(
        <AppointmentDetail
          appointment={appointmentFixture}
          onAction={vi.fn().mockResolvedValue(undefined)}
          onReschedule={onReschedule}
        />,
      );

      fireEvent.click(screen.getByText('Remarcar'));
      await waitFor(() => {
        expect(screen.getByText('Confirmar remarcação')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Nova data'), {
        target: { value: '2026-08-01' },
      });
      fireEvent.change(screen.getByLabelText('Novo horário'), {
        target: { value: '14:30' },
      });
      fireEvent.click(screen.getByText('Confirmar remarcação'));

      await waitFor(() => {
        expect(onReschedule).toHaveBeenCalledTimes(1);
      });
      const [startsAt] = onReschedule.mock.calls[0] as [Date, Date];
      expect(startsAt.toISOString().slice(0, 16)).toBe('2026-08-01T14:30');
    });
  });

  describe('Cenário: retorno programado ao concluir', () => {
    it('Dado alteração do retorno programado, Quando concluir, Então chama onAction com os novos dias de retorno', async () => {
      const onAction = vi.fn().mockResolvedValue(undefined);
      render(
        <AppointmentDetail
          appointment={appointmentFixture}
          onAction={onAction}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.change(
        screen.getByLabelText(/Ao concluir, programar retorno/),
        {
          target: { value: '7' },
        },
      );
      fireEvent.click(screen.getByText('Concluir + faturar'));

      await waitFor(() => {
        expect(onAction).toHaveBeenCalledWith('complete', 7);
      });
    });
  });

  describe('Cenário: erro não padronizado', () => {
    it('Dado onAction rejeitando com valor que não é Error, Quando acionado, Então exibe mensagem padrão de erro', async () => {
      const onAction = vi.fn().mockRejectedValue('falha inesperada');
      render(
        <AppointmentDetail
          appointment={appointmentFixture}
          onAction={onAction}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(screen.getByText('Confirmar cancelamento'));

      await waitFor(() => {
        expect(
          screen.getByText('Erro ao atualizar consulta'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: status sem rótulo mapeado', () => {
    it('Dado status não mapeado, Quando renderizar, Então exibe o status bruto como rótulo do badge', () => {
      render(
        <AppointmentDetail
          appointment={{ ...appointmentFixture, status: 'rescheduled' }}
          onAction={vi.fn().mockResolvedValue(undefined)}
          onReschedule={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.getByText('rescheduled')).toBeInTheDocument();
    });
  });
});

describe('Feature: Grade do calendário', () => {
  describe('Cenário: renderização de dias e consultas', () => {
    it('Dado consultas no mês, Quando renderizar, Então exibe cada consulta no dia correspondente', () => {
      const monthDate = new Date(2026, 6, 1);
      render(
        <CalendarGrid
          monthDate={monthDate}
          appointments={[julyAppointmentFixture]}
          onDayClick={vi.fn()}
          onAppointmentClick={vi.fn()}
        />,
      );

      expect(screen.getByText(/Maria Souza/)).toBeInTheDocument();
    });

    it('Dado clique em um dia sem consulta, Quando acionado, Então chama onDayClick', () => {
      // Dias passados/fora da config ficam não-clicáveis (AGENDA-01) — fixa
      // "hoje" dentro do próprio mês fixo (julho/2026) pra não depender da
      // data real de execução da suíte.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 1));
      const monthDate = new Date(2026, 6, 1);
      const onDayClick = vi.fn();
      const { container } = render(
        <CalendarGrid
          monthDate={monthDate}
          appointments={[]}
          onDayClick={onDayClick}
          onAppointmentClick={vi.fn()}
        />,
      );

      const dayCells = container.querySelectorAll('.cursor-pointer');
      fireEvent.click(dayCells[0]);
      vi.useRealTimers();

      expect(onDayClick).toHaveBeenCalledTimes(1);
    });

    it('Dado dia passado ou fora da config, Quando renderizar, Então marca a célula como aria-disabled e não clicável (AGENDA-01)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 15));
      const monthDate = new Date(2026, 6, 1);
      const onDayClick = vi.fn();
      const { container } = render(
        <CalendarGrid
          monthDate={monthDate}
          appointments={[]}
          onDayClick={onDayClick}
          onAppointmentClick={vi.fn()}
        />,
      );

      const invalidCells = container.querySelectorAll('[aria-disabled="true"]');
      expect(invalidCells.length).toBeGreaterThan(0);
      fireEvent.click(invalidCells[0]);
      vi.useRealTimers();

      expect(onDayClick).not.toHaveBeenCalled();
    });

    it('Dado clique em uma consulta, Quando acionado, Então chama onAppointmentClick e não propaga para o dia', () => {
      const monthDate = new Date(2026, 6, 1);
      const onDayClick = vi.fn();
      const onAppointmentClick = vi.fn();
      render(
        <CalendarGrid
          monthDate={monthDate}
          appointments={[julyAppointmentFixture]}
          onDayClick={onDayClick}
          onAppointmentClick={onAppointmentClick}
        />,
      );

      fireEvent.click(screen.getByText(/Maria Souza/));

      expect(onAppointmentClick).toHaveBeenCalledWith(julyAppointmentFixture);
      expect(onDayClick).not.toHaveBeenCalled();
    });

    it("Dado um dia com 5 consultas, Quando renderizar, Então mostra só 3 e o indicador '+2 mais' (AGENDA-06)", () => {
      const monthDate = new Date(2026, 6, 1);
      const manyAppointments = Array.from({ length: 5 }, (_, i) => ({
        ...julyAppointmentFixture,
        id: `appt-${i}`,
        patientName: `Paciente ${i}`,
        startsAt: new Date(
          new Date(julyAppointmentFixture.startsAt).getTime() + i * 30 * 60_000,
        ).toISOString(),
      }));
      render(
        <CalendarGrid
          monthDate={monthDate}
          appointments={manyAppointments}
          onDayClick={vi.fn()}
          onAppointmentClick={vi.fn()}
        />,
      );

      expect(screen.getByText('+2 mais')).toBeInTheDocument();
      expect(screen.getByText(/Paciente 0/)).toBeInTheDocument();
      expect(screen.getByText(/Paciente 2/)).toBeInTheDocument();
      expect(screen.queryByText(/Paciente 3/)).not.toBeInTheDocument();
    });

    it('Dado duas consultas no mesmo dia, uma com status não mapeado e sem nome do paciente, Quando renderizar, Então ordena por horário e aplica estilo padrão', () => {
      const monthDate = new Date(2026, 6, 1);
      const secondAppointment: AppointmentDto = {
        ...julyAppointmentFixture,
        id: 'appt-2',
        patientName: undefined,
        status: 'rescheduled',
        startsAt: new Date(
          new Date(julyAppointmentFixture.startsAt).getTime() + 30 * 60_000,
        ).toISOString(),
      };
      render(
        <CalendarGrid
          monthDate={monthDate}
          appointments={[secondAppointment, julyAppointmentFixture]}
          onDayClick={vi.fn()}
          onAppointmentClick={vi.fn()}
        />,
      );

      expect(screen.getByText(/Maria Souza/)).toBeInTheDocument();
    });
  });

  describe('Cenário: utilitário dayKey', () => {
    it('Dado uma data, Quando gerar a chave, Então formata como AAAA-MM-DD', () => {
      expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    });
  });
});
