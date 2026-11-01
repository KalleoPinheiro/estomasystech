// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import SettingsPage from '../support/settings-all-sections';

// CalendarIntegrationSection (issue #124) usa useSearchParams — fora de um
// router real do Next, o hook retorna null no ambiente de teste.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

interface FetchCall {
  url: string;
  init?: RequestInit;
}

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: async () => ({ success: ok, data, error: ok ? null : 'Erro' }),
});

const errorResponse = (message: string) => ({
  ok: false,
  json: async () => ({ success: false, data: null, error: message }),
});

const mockFetch = (
  router: (call: FetchCall) => { ok: boolean; json: () => Promise<unknown> },
): ReturnType<typeof vi.fn> => {
  // A tela de configurações também lista feriados/ausências e lê o canal de
  // e-mail: sem bloqueios e sem canal por padrão, para os cenários que não
  // tratam deles (`configuracoes-email-channel.test.tsx` cobre o canal).
  const defaults: Record<string, unknown> = {
    '/api/settings/schedule/closures': [],
    '/api/settings/email-channel': { channel: null },
  };
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const prefix = Object.keys(defaults).find((key) => url.startsWith(key));
    return prefix && (init?.method ?? 'GET') === 'GET'
      ? jsonResponse(defaults[prefix])
      : router({ url, init });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const EMPTY_CLINIC_INFO = {
  name: 'Clínica EstomaSysTech',
  cnpj: null,
  address: null,
  city: null,
  professionalName: null,
  professionalRegistry: null,
};

describe('Feature: SettingsPage', () => {
  describe('Cenário: dados da clínica (#61)', () => {
    const routeSchedule = (url: string) =>
      url.startsWith('/api/settings/schedule')
        ? jsonResponse({
            config: {
              weekdays: [1],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          })
        : undefined;

    it('Dado nenhum dado cadastrado, Quando a página carrega, Então exibe os campos vazios (não erro)', async () => {
      mockFetch(({ url }) => {
        const schedule = routeSchedule(url);
        if (schedule) return schedule;
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);

      await screen.findByText('Dados da clínica');
      expect(screen.getByPlaceholderText('00.000.000/0001-00')).toHaveValue('');
      expect(screen.getByPlaceholderText('Nome completo')).toHaveValue('');
    });

    it('Dado edição dos campos, Quando salvar com sucesso, Então envia PUT e confirma com toast', async () => {
      const fetchMock = mockFetch(({ url, init }) => {
        const schedule = routeSchedule(url);
        if (schedule) return schedule;
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (
          url.startsWith('/api/settings/clinic-info') &&
          init?.method === 'PUT'
        ) {
          return jsonResponse({
            info: {
              ...EMPTY_CLINIC_INFO,
              cnpj: '12.345.678/0001-95',
              professionalName: 'Enf. Ana',
            },
          });
        }
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Dados da clínica');

      fireEvent.change(screen.getByPlaceholderText('Nome da clínica'), {
        target: { value: 'Clínica EstomaSysTech Ltda' },
      });
      fireEvent.change(screen.getByPlaceholderText('00.000.000/0001-00'), {
        target: { value: '12.345.678/0001-95' },
      });
      fireEvent.change(screen.getByPlaceholderText('Nome completo'), {
        target: { value: 'Enf. Ana' },
      });
      fireEvent.click(screen.getByText('Salvar dados da clínica'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/settings/clinic-info',
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining(
              '"name":"Clínica EstomaSysTech Ltda"',
            ),
          }),
        );
      });
      expect(
        await screen.findByText('Dados da clínica salvos'),
      ).toBeInTheDocument();
    });

    it('Dado o contato da clínica, Quando editar e salvar, Então mostra e envia telefone e e-mail de contato', async () => {
      const fetchMock = mockFetch(({ url, init }) => {
        const schedule = routeSchedule(url);
        if (schedule) return schedule;
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({
            info: {
              ...EMPTY_CLINIC_INFO,
              contactPhone: '11 3333-4444',
              contactEmail: null,
              ...(init?.method === 'PUT' ? { contactEmail: 'c@x.com' } : {}),
            },
          });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Dados da clínica');

      expect(screen.getByLabelText('Telefone/WhatsApp de contato')).toHaveValue(
        '11 3333-4444',
      );
      fireEvent.change(screen.getByLabelText('E-mail de contato'), {
        target: { value: 'c@x.com' },
      });
      fireEvent.click(screen.getByText('Salvar dados da clínica'));

      await waitFor(() => {
        const put = fetchMock.mock.calls.find(
          ([url, init]) =>
            url === '/api/settings/clinic-info' && init?.method === 'PUT',
        );
        expect(JSON.parse(put?.[1]?.body as string)).toMatchObject({
          contactPhone: '11 3333-4444',
          contactEmail: 'c@x.com',
        });
      });
    });

    it('Dado erro ao salvar, Quando a chamada falha, Então exibe alerta de erro', async () => {
      mockFetch(({ url, init }) => {
        const schedule = routeSchedule(url);
        if (schedule) return schedule;
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (
          url.startsWith('/api/settings/clinic-info') &&
          init?.method === 'PUT'
        ) {
          return errorResponse(
            'Apenas Admin de Empresa pode editar os dados da clínica',
          );
        }
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Dados da clínica');

      fireEvent.click(screen.getByText('Salvar dados da clínica'));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'Apenas Admin de Empresa pode editar os dados da clínica',
      );
    });
  });

  /** AUTH-20: a conexão da agenda é oferecida como integração, fora do login. */
  describe('Cenário: integração do Google Agenda', () => {
    it('Dado a tela de configurações, Quando carregar, Então oferece o link de conexão da agenda apontando para a rota de integração', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [1],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);

      const link = await screen.findByRole('link', {
        name: 'Conectar Google Agenda',
      });
      expect(link).toHaveAttribute('href', '/api/integrations/google-calendar');
    });
  });

  describe('Cenário: grade de horários', () => {
    it('Dado configuração padrão, Quando a página carrega, Então exibe aviso de padrão e valores', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [1, 2, 3, 4, 5],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);

      expect(
        await screen.findByText(/usando padrão — nada salvo ainda/),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue('8')).toBeInTheDocument();
      expect(screen.getByDisplayValue('18')).toBeInTheDocument();
      expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    });

    it('Dado clique em um dia da semana, Quando alternado, Então o dia muda de seleção', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [1, 2, 3, 4, 5],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: false,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Grade de horários');

      const domButton = screen.getByRole('button', { name: 'Dom' });
      expect(domButton).toHaveAttribute('aria-pressed', 'false');
      // SPEC_DEVIATION: o dia selecionado usava a receita local accentButton
      // (classe utilitária `bg-accent-ink`) como override de className sobre o
      // Button; migrado para `variant="accent"` (T32), que o pacote 3.x resolve
      // para a classe semântica `sv-btn--accent` em vez de um utilitário
      // Tailwind. O comportamento (dia selecionado ganha a cor de destaque) é o
      // mesmo; a asserção segue a classe real emitida pelo pacote.
      expect(domButton.className).not.toContain('sv-btn--accent');
      fireEvent.click(domButton);
      expect(domButton).toHaveAttribute('aria-pressed', 'true');
      expect(domButton.className).toContain('sv-btn--accent');
    });

    it('Dado clique em salvar grade, Quando a chamada é bem-sucedida, Então exibe confirmação', async () => {
      mockFetch(({ url, init }) => {
        if (
          url.startsWith('/api/settings/schedule') &&
          init?.method === 'PUT'
        ) {
          return jsonResponse({});
        }
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [1, 2, 3, 4, 5],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: false,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Grade de horários');

      fireEvent.click(screen.getByText('Salvar grade'));

      const toastText = await screen.findByText(
        'Grade salva — vale imediatamente para novos agendamentos.',
      );
      expect(toastText.closest('.sv-toast--success')).not.toBeNull();
    });

    it('Dado erro ao salvar grade, Quando falha a chamada, Então exibe alerta de erro', async () => {
      mockFetch(({ url, init }) => {
        if (
          url.startsWith('/api/settings/schedule') &&
          init?.method === 'PUT'
        ) {
          return jsonResponse(null, false);
        }
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [1, 2, 3, 4, 5],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: false,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Grade de horários');

      fireEvent.click(screen.getByText('Salvar grade'));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('Dado erro ao carregar a grade de horários, Quando a página carrega, Então exibe alerta de erro', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule'))
          return jsonResponse(null, false);
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('Dado clique em um dia já selecionado, Quando alternado, Então o dia é removido da seleção', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [1, 2, 3, 4, 5],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: false,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Grade de horários');

      const segButton = screen.getByRole('button', { name: 'Seg' });
      expect(segButton).toHaveAttribute('aria-pressed', 'true');
      // SPEC_DEVIATION: mesma migração accentButton → variant="accent" (T32);
      // ver nota no primeiro teste desta seção.
      expect(segButton.className).toContain('sv-btn--accent');
      fireEvent.click(segButton);
      expect(segButton).toHaveAttribute('aria-pressed', 'false');
      expect(segButton.className).not.toContain('sv-btn--accent');
    });

    it('Dado alteração dos campos de abertura, fechamento e intervalo, Quando editados, Então refletem os novos valores', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [1, 2, 3, 4, 5],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: false,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Grade de horários');

      fireEvent.change(screen.getByLabelText(/Abre \(h\)/), {
        target: { value: '7' },
      });
      fireEvent.change(screen.getByLabelText(/Fecha \(h\)/), {
        target: { value: '20' },
      });
      fireEvent.change(screen.getByLabelText(/Intervalo \(min\)/), {
        target: { value: '45' },
      });

      expect(screen.getByDisplayValue('7')).toBeInTheDocument();
      expect(screen.getByDisplayValue('20')).toBeInTheDocument();
      expect(screen.getByDisplayValue('45')).toBeInTheDocument();
    });

    it('Dado erro não padronizado ao salvar grade, Quando a chamada rejeita com valor que não é Error, Então exibe mensagem padrão', async () => {
      mockFetch(({ url, init }) => {
        if (
          url.startsWith('/api/settings/schedule') &&
          init?.method === 'PUT'
        ) {
          throw 'falha inesperada';
        }
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [1, 2, 3, 4, 5],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: false,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Grade de horários');

      fireEvent.click(screen.getByText('Salvar grade'));

      expect(
        within(await screen.findByRole('alert')).getByText(
          'Erro ao salvar grade',
        ),
      ).toBeInTheDocument();
    });

    it('Dado salvar com sucesso, Quando a chamada retorna, Então recarrega o estado e some o aviso de padrão (CFG-01)', async () => {
      let scheduleCallCount = 0;
      mockFetch(({ url, init }) => {
        if (
          url.startsWith('/api/settings/schedule') &&
          init?.method === 'PUT'
        ) {
          return jsonResponse({});
        }
        if (url.startsWith('/api/settings/schedule')) {
          scheduleCallCount += 1;
          return jsonResponse({
            config: {
              weekdays: [1, 2, 3, 4, 5],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: scheduleCallCount === 1,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      expect(
        await screen.findByText(/usando padrão — nada salvo ainda/),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByText('Salvar grade'));

      await screen.findByText(
        'Grade salva — vale imediatamente para novos agendamentos.',
      );
      await waitFor(() => {
        expect(
          screen.queryByText(/usando padrão — nada salvo ainda/),
        ).not.toBeInTheDocument();
      });
    });

    it('Dado abertura depois do fechamento, Quando salvar, Então bloqueia com erro inline sem chamar a API (CFG-02)', async () => {
      const fetchMock = mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [1, 2, 3, 4, 5],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: false,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Grade de horários');

      fireEvent.change(screen.getByLabelText(/Abre \(h\)/), {
        target: { value: '18' },
      });
      fireEvent.change(screen.getByLabelText(/Fecha \(h\)/), {
        target: { value: '8' },
      });
      fireEvent.click(screen.getByText('Salvar grade'));

      expect(
        await screen.findByText(
          'Horário de abertura deve ser antes do fechamento',
        ),
      ).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).startsWith('/api/settings/schedule') &&
            (init as RequestInit | undefined)?.method === 'PUT',
        ),
      ).toBe(false);
    });

    it('Dado intervalo mínimo fora de 15-120, Quando salvar, Então bloqueia com erro inline (CFG-02)', async () => {
      const fetchMock = mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [1, 2, 3, 4, 5],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: false,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Grade de horários');

      fireEvent.change(screen.getByLabelText(/Intervalo \(min\)/), {
        target: { value: '10' },
      });
      fireEvent.click(screen.getByText('Salvar grade'));

      expect(
        await screen.findByText(
          'Intervalo mínimo deve estar entre 15 e 120 minutos',
        ),
      ).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).startsWith('/api/settings/schedule') &&
            (init as RequestInit | undefined)?.method === 'PUT',
        ),
      ).toBe(false);
    });
  });

  describe('Cenário: contas de acesso', () => {
    it('Dado nenhuma conta cadastrada, Quando a página carrega, Então exibe o estado vazio', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);

      expect(
        await screen.findByText(/Nenhuma conta cadastrada nesta empresa/),
      ).toBeInTheDocument();
    });

    it('Dado contas cadastradas, Quando a página carrega, Então lista email e situação', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts')) {
          return jsonResponse([
            {
              id: 'a1',
              email: 'ana@clinica.com',
              professionalId: 'pr1',
              active: true,
            },
            {
              id: 'a2',
              email: 'bob@clinica.com',
              professionalId: null,
              active: false,
            },
          ]);
        }
        if (url.startsWith('/api/professionals')) {
          return jsonResponse([
            {
              id: 'pr1',
              fullName: 'Dra. Ana',
              registry: null,
              commissionPct: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);

      expect(await screen.findByText('ana@clinica.com')).toBeInTheDocument();
      expect(screen.getByText('bob@clinica.com')).toBeInTheDocument();
      // O nome também aparece como opção no formulário de ausências.
      expect(
        screen.getByRole('cell', { name: 'Dra. Ana' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Ativa')).toBeInTheDocument();
      expect(screen.getByText('Desativada')).toBeInTheDocument();

      // CFG-03: linha inativa usa bg-surface-2/60, não opacity-50
      const inactiveRow = screen.getByText('bob@clinica.com').closest('tr');
      expect(inactiveRow).toHaveClass('bg-surface-2/60');
      expect(inactiveRow).not.toHaveClass('opacity-50');
    });

    it('Dado clique em desativar conta, Quando a chamada é bem-sucedida, Então recarrega as contas', async () => {
      let accountsCallCount = 0;
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts/a1') && init?.method === 'PATCH') {
          return jsonResponse({
            id: 'a1',
            email: 'ana@clinica.com',
            professionalId: null,
            active: false,
          });
        }
        if (url.startsWith('/api/accounts')) {
          accountsCallCount += 1;
          return jsonResponse([
            {
              id: 'a1',
              email: 'ana@clinica.com',
              professionalId: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('ana@clinica.com');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(accountsCallCount).toBeGreaterThanOrEqual(2);
      });
      expect(await screen.findByText('Conta desativada')).toBeInTheDocument();
    });

    it('Dado erro ao desativar conta, Quando falha, Então exibe alerta de erro', async () => {
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts/a1') && init?.method === 'PATCH') {
          return jsonResponse(null, false);
        }
        if (url.startsWith('/api/accounts')) {
          return jsonResponse([
            {
              id: 'a1',
              email: 'ana@clinica.com',
              professionalId: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('ana@clinica.com');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('Dado erro não padronizado ao desativar conta, Quando a chamada rejeita com valor que não é Error, Então exibe mensagem padrão e toast de erro', async () => {
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts/a1') && init?.method === 'PATCH') {
          throw 'falha inesperada';
        }
        if (url.startsWith('/api/accounts')) {
          return jsonResponse([
            {
              id: 'a1',
              email: 'ana@clinica.com',
              professionalId: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('ana@clinica.com');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(
          screen.getAllByText('Erro ao atualizar conta').length,
        ).toBeGreaterThanOrEqual(2);
      });
    });

    it('Dado clique em desativar conta seguido de cancelamento no dialog, Quando acionado, Então não chama a API', async () => {
      let patchCalls = 0;
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts/a1') && init?.method === 'PATCH') {
          patchCalls += 1;
          return jsonResponse({
            id: 'a1',
            email: 'ana@clinica.com',
            professionalId: null,
            active: false,
          });
        }
        if (url.startsWith('/api/accounts')) {
          return jsonResponse([
            {
              id: 'a1',
              email: 'ana@clinica.com',
              professionalId: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('ana@clinica.com');

      fireEvent.click(screen.getByText('Desativar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(patchCalls).toBe(0);
    });

    it('Dado erro ao carregar contas, Quando a página carrega, Então exibe alerta de erro', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse(null, false);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('Grade de horários');

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('Dado clique em nova conta e preenchimento do formulário, Quando submetido, Então cria a conta e fecha o modal', async () => {
      let created = false;
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url === '/api/accounts' && init?.method === 'POST') {
          created = true;
          return jsonResponse({
            id: 'a2',
            email: 'nova@clinica.com',
            professionalId: null,
            active: true,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) {
          return jsonResponse([
            {
              id: 'pr1',
              fullName: 'Dra. Ana',
              registry: null,
              commissionPct: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText(/Nenhuma conta cadastrada nesta empresa/);

      fireEvent.click(screen.getByText('+ Nova conta'));
      fireEvent.change(screen.getByLabelText(/Email/), {
        target: { value: 'nova@clinica.com' },
      });
      fireEvent.click(screen.getByText('Criar conta'));

      await waitFor(() => expect(created).toBe(true));
      expect(await screen.findByText('Conta criada')).toBeInTheDocument();
    });

    it('Dado seleção de profissional vinculado, Quando escolhido, Então envia o profissional selecionado ao criar a conta', async () => {
      let sentProfessionalId: unknown;
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url === '/api/accounts' && init?.method === 'POST') {
          sentProfessionalId = JSON.parse(String(init.body)).professionalId;
          return jsonResponse({
            id: 'a2',
            email: 'nova@clinica.com',
            professionalId: 'pr1',
            active: true,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) {
          return jsonResponse([
            {
              id: 'pr1',
              fullName: 'Dra. Ana',
              registry: null,
              commissionPct: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText(/Nenhuma conta cadastrada nesta empresa/);

      fireEvent.click(screen.getByText('+ Nova conta'));
      fireEvent.change(screen.getByLabelText(/Email/), {
        target: { value: 'nova@clinica.com' },
      });
      fireEvent.change(screen.getByLabelText(/Profissional vinculado/), {
        target: { value: 'pr1' },
      });
      fireEvent.click(screen.getByText('Criar conta'));

      await waitFor(() => expect(sentProfessionalId).toBe('pr1'));
    });

    it('Dado papel profissional selecionado, Quando enviar sem profissional vinculado, Então recusa sem chamar a API', async () => {
      let called = false;
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url === '/api/accounts' && init?.method === 'POST') {
          called = true;
          return jsonResponse({
            id: 'a2',
            email: 'nova@clinica.com',
            professionalId: 'pr1',
            active: true,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) {
          return jsonResponse([
            {
              id: 'pr1',
              fullName: 'Dra. Ana',
              registry: null,
              commissionPct: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText(/Nenhuma conta cadastrada nesta empresa/);

      fireEvent.click(screen.getByText('+ Nova conta'));
      fireEvent.change(screen.getByLabelText(/Email/), {
        target: { value: 'nova@clinica.com' },
      });
      fireEvent.change(screen.getByLabelText(/Papel/), {
        target: { value: 'profissional' },
      });
      fireEvent.click(screen.getByText('Criar conta'));

      // O <select required> nativo bloqueia o submit antes do handler rodar
      // (constraint validation do jsdom) — a API nunca é chamada.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(called).toBe(false);
    });

    it('Dado papel profissional selecionado com profissional vinculado, Quando enviar, Então envia role e professionalId', async () => {
      let sentBody: { role?: string; professionalId?: string } = {};
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url === '/api/accounts' && init?.method === 'POST') {
          sentBody = JSON.parse(String(init.body));
          return jsonResponse({
            id: 'a2',
            email: 'nova-prof@clinica.com',
            professionalId: 'pr1',
            active: true,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) {
          return jsonResponse([
            {
              id: 'pr1',
              fullName: 'Dra. Ana',
              registry: null,
              commissionPct: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText(/Nenhuma conta cadastrada nesta empresa/);

      fireEvent.click(screen.getByText('+ Nova conta'));
      fireEvent.change(screen.getByLabelText(/Email/), {
        target: { value: 'nova-prof@clinica.com' },
      });
      fireEvent.change(screen.getByLabelText(/Papel/), {
        target: { value: 'profissional' },
      });
      fireEvent.change(screen.getByLabelText(/Profissional vinculado/), {
        target: { value: 'pr1' },
      });
      fireEvent.click(screen.getByText('Criar conta'));

      await waitFor(() =>
        expect(sentBody).toEqual({
          email: 'nova-prof@clinica.com',
          role: 'profissional',
          professionalId: 'pr1',
        }),
      );
    });

    it('Dado modal de nova conta aberto, Quando fechado sem submeter, Então o modal desaparece', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText(/Nenhuma conta cadastrada nesta empresa/);

      fireEvent.click(screen.getByText('+ Nova conta'));
      expect(
        await screen.findByText('Nova conta de acesso'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      await waitFor(() => {
        expect(
          screen.queryByText('Nova conta de acesso'),
        ).not.toBeInTheDocument();
      });
    });

    it('Dado erro padronizado ao criar conta, Quando a chamada falha, Então exibe a mensagem de erro no formulário e toast de erro', async () => {
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url === '/api/accounts' && init?.method === 'POST') {
          return errorResponse('Email já cadastrado');
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText(/Nenhuma conta cadastrada nesta empresa/);

      fireEvent.click(screen.getByText('+ Nova conta'));
      fireEvent.change(screen.getByLabelText(/Email/), {
        target: { value: 'nova@clinica.com' },
      });
      fireEvent.click(screen.getByText('Criar conta'));

      await waitFor(() => {
        expect(
          screen.getAllByText('Email já cadastrado').length,
        ).toBeGreaterThanOrEqual(2);
      });
    });

    it('Dado erro não padronizado ao criar conta, Quando a chamada rejeita com valor que não é Error, Então exibe mensagem padrão e toast de erro', async () => {
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url === '/api/accounts' && init?.method === 'POST') {
          throw 'falha inesperada';
        }
        if (url.startsWith('/api/accounts')) return jsonResponse([]);
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText(/Nenhuma conta cadastrada nesta empresa/);

      fireEvent.click(screen.getByText('+ Nova conta'));
      fireEvent.change(screen.getByLabelText(/Email/), {
        target: { value: 'nova@clinica.com' },
      });
      fireEvent.click(screen.getByText('Criar conta'));

      await waitFor(() => {
        expect(
          screen.getAllByText('Erro ao criar conta').length,
        ).toBeGreaterThanOrEqual(2);
      });
    });

    it('Dado falha ao carregar profissionais, Quando a página exibe contas e o modal de nova conta, Então usa lista vazia como padrão', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (url.startsWith('/api/accounts')) {
          return jsonResponse([
            {
              id: 'a1',
              email: 'ana@clinica.com',
              professionalId: 'pr1',
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/professionals'))
          return jsonResponse(null, false);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('ana@clinica.com');

      expect(screen.getByText('—')).toBeInTheDocument();

      fireEvent.click(screen.getByText('+ Nova conta'));
      expect(
        await screen.findByText('Nova conta de acesso'),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Profissional vinculado/),
      ).toHaveDisplayValue('— nenhum —');
    });

    it('Dado clique em reenviar convite, Quando o e-mail é entregue, Então exibe toast de sucesso', async () => {
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (
          url.startsWith('/api/accounts/a1/resend-invite') &&
          init?.method === 'POST'
        ) {
          return jsonResponse({ delivered: true });
        }
        if (url.startsWith('/api/accounts')) {
          return jsonResponse([
            {
              id: 'a1',
              email: 'ana@clinica.com',
              professionalId: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('ana@clinica.com');

      fireEvent.click(screen.getByText('Reenviar convite'));

      await waitFor(() => {
        expect(
          screen.getAllByText('Convite reenviado para ana@clinica.com.'),
        ).toHaveLength(2);
      });
      const toastText = screen
        .getAllByText('Convite reenviado para ana@clinica.com.')
        .find((el) => el.className === 'sv-toast__description');
      expect(toastText?.closest('.sv-toast--success')).not.toBeNull();
    });

    it('Dado clique em reenviar convite, Quando o e-mail não é entregue, Então exibe toast de aviso e o link para envio manual (C2, #265)', async () => {
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (
          url.startsWith('/api/accounts/a1/resend-invite') &&
          init?.method === 'POST'
        ) {
          return jsonResponse({
            delivered: false,
            inviteUrl: 'https://app.estomasystech.test/definir-senha?token=t1',
          });
        }
        if (url.startsWith('/api/accounts')) {
          return jsonResponse([
            {
              id: 'a1',
              email: 'ana@clinica.com',
              professionalId: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('ana@clinica.com');

      fireEvent.click(screen.getByText('Reenviar convite'));

      const message =
        'O e-mail para ana@clinica.com não saiu — copie o link e envie manualmente.';
      const toastText = await screen.findByText(message);
      expect(toastText.closest('.sv-toast--warning')).not.toBeNull();
      expect(screen.getByLabelText('Link para ana@clinica.com')).toHaveValue(
        'https://app.estomasystech.test/definir-senha?token=t1',
      );
    });

    it('Dado clique em reenviar convite, Quando a chamada falha, Então exibe toast de erro', async () => {
      mockFetch(({ url, init }) => {
        if (url.startsWith('/api/settings/schedule')) {
          return jsonResponse({
            config: {
              weekdays: [],
              startHour: 8,
              endHour: 18,
              minGapMinutes: 30,
            },
            isDefault: true,
          });
        }
        if (
          url.startsWith('/api/accounts/a1/resend-invite') &&
          init?.method === 'POST'
        ) {
          return errorResponse('Erro ao reenviar convite');
        }
        if (url.startsWith('/api/accounts')) {
          return jsonResponse([
            {
              id: 'a1',
              email: 'ana@clinica.com',
              professionalId: null,
              active: true,
            },
          ]);
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        if (url.startsWith('/api/settings/clinic-info'))
          return jsonResponse({ info: EMPTY_CLINIC_INFO });
        if (url.startsWith('/api/settings/calendar-integration'))
          return jsonResponse({
            connected: false,
            email: null,
            connectedAt: null,
          });
        return jsonResponse(null, false);
      });

      renderWithToast(<SettingsPage />);
      await screen.findByText('ana@clinica.com');

      fireEvent.click(screen.getByText('Reenviar convite'));

      await waitFor(() => {
        expect(
          screen.getAllByText('Erro ao reenviar convite').length,
        ).toBeGreaterThanOrEqual(2);
      });
    });
  });
});
