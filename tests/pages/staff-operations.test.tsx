// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickPatient } from '@/../tests/support/patient-picker';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import AuditPage from '@/app/(staff)/auditoria/page';
import SettingsPage from '@/app/(staff)/configuracoes/page';
import PartnersPage from '@/app/(staff)/parceiros/page';
import ProfessionalsPage from '@/app/(staff)/profissionais/page';

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

describe('Feature: AuditPage', () => {
  describe('Cenário: carregamento e listagem', () => {
    it('Dado eventos de auditoria, Quando a página carrega, Então lista eventos com rótulos traduzidos', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/patients')) {
          return jsonResponse([{ id: 'p1', fullName: 'Maria Silva' }]);
        }
        if (url.startsWith('/api/audit')) {
          return jsonResponse([
            {
              id: 'e1',
              actorRole: 'staff',
              actorId: 'u1',
              action: 'update',
              resourceType: 'evolution',
              patientId: 'p1',
              patientName: 'Maria Silva',
              detail: 'Editou evolução',
              occurredAt: '2026-01-01T10:00:00.000Z',
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      render(<AuditPage />);

      expect(await screen.findByText('Alteração')).toBeInTheDocument();
      expect(screen.getByText('Evolução')).toBeInTheDocument();
      expect(
        screen.getByRole('cell', { name: 'Maria Silva' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Editou evolução')).toBeInTheDocument();
    });

    it('Dado nenhum evento, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/patients')) return jsonResponse([]);
        if (url.startsWith('/api/audit')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      render(<AuditPage />);

      expect(
        await screen.findByText('Nenhum evento de auditoria registrado.'),
      ).toBeInTheDocument();
    });

    it('Dado erro ao carregar auditoria, Quando a página carrega, Então exibe alerta de erro', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/patients')) return jsonResponse([]);
        if (url.startsWith('/api/audit')) return jsonResponse(null, false);
        return jsonResponse(null, false);
      });

      render(<AuditPage />);

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Cenário: filtro por paciente', () => {
    it('Dado seleção de paciente no filtro, Quando alterado, Então refaz a busca com patientId', async () => {
      const fetchMock = mockFetch(({ url }) => {
        if (url.startsWith('/api/patients')) {
          return jsonResponse([
            { id: 'p1', fullName: 'Maria Silva', active: true },
          ]);
        }
        if (url.startsWith('/api/audit')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      render(<AuditPage />);
      await screen.findByText('Nenhum evento de auditoria registrado.');

      await pickPatient('Maria Silva', 'Filtrar por paciente');

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes('/api/audit?patientId=p1'),
          ),
        ).toBe(true);
      });
    });
  });

  describe('Cenário: rótulos e valores sem mapeamento', () => {
    it('Dado evento com ação e recurso sem rótulo mapeado e paciente sem correspondência, Quando renderizar, Então exibe os valores brutos', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/patients')) {
          return jsonResponse([{ id: 'p1', fullName: 'Maria Silva' }]);
        }
        if (url.startsWith('/api/audit')) {
          return jsonResponse([
            {
              id: 'e2',
              actorRole: 'staff',
              actorId: 'u1',
              action: 'export',
              resourceType: 'unknown-resource',
              patientId: 'p2',
              detail: 'Detalhe do evento',
              occurredAt: '2026-01-02T10:00:00.000Z',
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      render(<AuditPage />);

      expect(await screen.findByText('export')).toBeInTheDocument();
      expect(screen.getByText('unknown-resource')).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'p2' })).toBeInTheDocument();
    });

    it('Dado evento sem paciente e sem detalhe, Quando renderizar, Então exibe traço para paciente e detalhe', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/patients')) return jsonResponse([]);
        if (url.startsWith('/api/audit')) {
          return jsonResponse([
            {
              id: 'e3',
              actorRole: 'staff',
              actorId: 'u1',
              action: 'read',
              resourceType: 'photo',
              patientId: null,
              detail: null,
              occurredAt: '2026-01-03T10:00:00.000Z',
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      render(<AuditPage />);

      expect(await screen.findByText('Leitura')).toBeInTheDocument();
      expect(screen.getAllByText('—')).toHaveLength(2);
    });
  });

  describe('Cenário: filtro de período (AUD-04)', () => {
    it('Dado preenchimento de De/Até, Quando alterado, Então a busca inclui from/to na querystring', async () => {
      const fetchMock = mockFetch(({ url }) => {
        if (url.startsWith('/api/patients')) return jsonResponse([]);
        if (url.startsWith('/api/audit')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      render(<AuditPage />);
      await screen.findByText('Nenhum evento de auditoria registrado.');

      fireEvent.change(screen.getByLabelText('De'), {
        target: { value: '2026-01-01' },
      });
      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes('/api/audit?from='),
          ),
        ).toBe(true);
      });

      fireEvent.change(screen.getByLabelText('Até'), {
        target: { value: '2026-01-31' },
      });
      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(
            ([url]) =>
              String(url).includes('from=') && String(url).includes('&to='),
          ),
        ).toBe(true);
      });
    });
  });

  describe('Cenário: acessibilidade e formatação (AUD-05/AUD-06)', () => {
    it('Dado select de paciente, Então tem aria-label acessível', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/patients')) return jsonResponse([]);
        if (url.startsWith('/api/audit')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      render(<AuditPage />);

      expect(
        await screen.findByLabelText('Filtrar por paciente'),
      ).toBeInTheDocument();
    });

    it('Dado evento com horário conhecido, Então a coluna Quando inclui segundos', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/patients')) return jsonResponse([]);
        if (url.startsWith('/api/audit')) {
          return jsonResponse([
            {
              id: 'e4',
              actorRole: 'staff',
              actorId: 'u1',
              action: 'read',
              resourceType: 'patient',
              patientId: null,
              detail: null,
              occurredAt: '2026-01-01T10:00:45.000Z',
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      render(<AuditPage />);

      await screen.findByText('Leitura');
      expect(screen.getByText(/:\d{2}:\d{2}$/)).toBeInTheDocument();
    });
  });
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

describe('Feature: PartnersPage', () => {
  describe('Cenário: listagem', () => {
    it('Dado nenhum parceiro, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);

      expect(
        await screen.findByText('Nenhum parceiro cadastrado.'),
      ).toBeInTheDocument();
    });

    it('Dado parceiros cadastrados, Quando a página carrega, Então lista dados', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt1',
              fullName: 'Dr. João',
              email: 'joao@parceiro.com',
              phone: '11999999999',
              crm: 'CRM-SP 123',
              specialty: 'Vascular',
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);

      expect(await screen.findByText('Dr. João')).toBeInTheDocument();
      expect(screen.getByText('CRM-SP 123')).toBeInTheDocument();
      expect(screen.getByText('Vascular')).toBeInTheDocument();
      expect(screen.getByText('Ativo')).toBeInTheDocument();
    });

    it('Dado erro ao carregar, Quando a página carrega, Então exibe alerta de erro', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) return jsonResponse(null, false);
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Cenário: alternar situação', () => {
    it('Dado clique em desativar, Quando a chamada é bem-sucedida, Então recarrega a lista', async () => {
      let calls = 0;
      mockFetch(({ url, init }) => {
        if (url === '/api/partners/pt1' && init?.method === 'PUT') {
          return jsonResponse({ id: 'pt1', active: false });
        }
        if (url.startsWith('/api/partners')) {
          calls += 1;
          return jsonResponse([
            {
              id: 'pt1',
              fullName: 'Dr. João',
              email: 'joao@parceiro.com',
              phone: '11999999999',
              crm: null,
              specialty: null,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dr. João');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
      expect(
        await screen.findByText('Parceiro desativado'),
      ).toBeInTheDocument();
    });

    it('Dado erro ao alternar situação, Quando falha, Então exibe alerta de erro', async () => {
      mockFetch(({ url, init }) => {
        if (url === '/api/partners/pt1' && init?.method === 'PUT') {
          return errorResponse('Erro ao atualizar parceiro');
        }
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt1',
              fullName: 'Dr. João',
              email: 'joao@parceiro.com',
              phone: '11999999999',
              crm: null,
              specialty: null,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dr. João');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Erro ao atualizar parceiro'),
      ).toBeInTheDocument();
    });

    it('Dado erro não padronizado ao alternar situação, Quando a chamada rejeita com valor que não é Error, Então exibe mensagem padrão', async () => {
      mockFetch(({ url, init }) => {
        if (url === '/api/partners/pt1' && init?.method === 'PUT') {
          throw 'falha inesperada';
        }
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt1',
              fullName: 'Dr. João',
              email: 'joao@parceiro.com',
              phone: '11999999999',
              crm: null,
              specialty: null,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dr. João');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Erro ao atualizar parceiro'),
      ).toBeInTheDocument();
    });

    it('Dado clique em desativar seguido de cancelamento no dialog, Quando acionado, Então não chama a API', async () => {
      let putCalls = 0;
      mockFetch(({ url, init }) => {
        if (url === '/api/partners/pt1' && init?.method === 'PUT') {
          putCalls += 1;
          return jsonResponse({ id: 'pt1', active: false });
        }
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt1',
              fullName: 'Dr. João',
              email: 'joao@parceiro.com',
              phone: '11999999999',
              crm: null,
              specialty: null,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dr. João');

      fireEvent.click(screen.getByText('Desativar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(putCalls).toBe(0);
    });
  });

  describe('Cenário: parceiro inativo na listagem', () => {
    it('Dado parceiro inativo, Quando a página carrega, Então exibe situação inativa e ação de reativar', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt3',
              fullName: 'Dr. Carlos',
              email: 'carlos@parceiro.com',
              phone: '11977777777',
              crm: null,
              specialty: null,
              active: false,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);

      expect(await screen.findByText('Dr. Carlos')).toBeInTheDocument();
      expect(screen.getByText('Inativo')).toBeInTheDocument();
      expect(screen.getByText('Reativar')).toBeInTheDocument();
    });

    it("Dado clique em reativar, Quando a chamada é bem-sucedida, Então exibe toast 'Parceiro ativado'", async () => {
      let calls = 0;
      mockFetch(({ url, init }) => {
        if (url === '/api/partners/pt3' && init?.method === 'PUT') {
          return jsonResponse({ id: 'pt3', active: true });
        }
        if (url.startsWith('/api/partners')) {
          calls += 1;
          return jsonResponse([
            {
              id: 'pt3',
              fullName: 'Dr. Carlos',
              email: 'carlos@parceiro.com',
              phone: '11977777777',
              crm: null,
              specialty: null,
              active: false,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dr. Carlos');

      fireEvent.click(screen.getByText('Reativar'));

      await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
      expect(await screen.findByText('Parceiro ativado')).toBeInTheDocument();
    });

    it('Dado parceiro inativo, Quando renderizar a linha, Então usa bg-surface-2/60 em vez de opacity-50 (DIR-01)', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt3',
              fullName: 'Dr. Carlos',
              email: 'carlos@parceiro.com',
              phone: '11977777777',
              crm: null,
              specialty: null,
              active: false,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      const row = (await screen.findByText('Dr. Carlos')).closest('tr');

      expect(row).toHaveClass('bg-surface-2/60');
      expect(row).not.toHaveClass('opacity-50');
    });
  });

  describe('Cenário: nomenclatura, contato acionável e ações (PART-04/05, DIR-02)', () => {
    it("Dado a página de parceiros, Quando renderizar, Então o título é 'Parceiros'", async () => {
      mockFetch(() => jsonResponse([]));

      renderWithToast(<PartnersPage />);

      expect(
        await screen.findByRole('heading', { name: 'Parceiros', level: 1 }),
      ).toBeInTheDocument();
    });

    it('Dado um parceiro, Quando renderizar Contato, Então email e telefone são links mailto/tel', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt5',
              fullName: 'Dr. Igor',
              email: 'igor@parceiro.com',
              phone: '11955554444',
              crm: null,
              specialty: null,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dr. Igor');

      expect(
        screen.getByRole('link', { name: 'igor@parceiro.com' }),
      ).toHaveAttribute('href', 'mailto:igor@parceiro.com');
      expect(screen.getByRole('link', { name: '11955554444' })).toHaveAttribute(
        'href',
        'tel:11955554444',
      );
    });

    it('Dado um parceiro ativo, Quando renderizar as ações, Então usam Button ghost/sm', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt6',
              fullName: 'Dra. Lia',
              email: 'lia@parceiro.com',
              phone: '11944443333',
              crm: null,
              specialty: null,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dra. Lia');

      expect(screen.getByText('Editar')).toHaveClass(
        'sv-btn--ghost',
        'sv-btn--sm',
      );
    });

    it('Dado clique em Desativar parceiro, Quando o diálogo abre, Então explica o impacto em pacientes indicados (PART-03)', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt7',
              fullName: 'Dr. Marco',
              email: 'marco@parceiro.com',
              phone: '11933332222',
              crm: null,
              specialty: null,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dr. Marco');

      fireEvent.click(screen.getByText('Desativar'));

      expect(
        await screen.findByText(/podem perder a referência na próxima edição/),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: criação e edição via modal', () => {
    it('Dado clique em novo parceiro e preenchimento, Quando submetido, Então cria o parceiro', async () => {
      let created = false;
      mockFetch(({ url, init }) => {
        if (url === '/api/partners' && init?.method === 'POST') {
          created = true;
          return jsonResponse({ id: 'pt2' });
        }
        if (url.startsWith('/api/partners')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Nenhum parceiro cadastrado.');

      fireEvent.click(screen.getByText('+ Novo parceiro'));
      fireEvent.change(screen.getByLabelText(/Nome completo/), {
        target: { value: 'Dra. Carla' },
      });
      fireEvent.change(screen.getByLabelText(/Email \*/), {
        target: { value: 'carla@parceiro.com' },
      });
      fireEvent.change(screen.getByLabelText(/Telefone/), {
        target: { value: '11988887777' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => expect(created).toBe(true));
      expect(await screen.findByText('Parceiro salvo')).toBeInTheDocument();
    });

    it('Dado o modal de novo parceiro, Quando renderizar, Então o grid de Telefone/CRM é responsivo (PART-02)', async () => {
      mockFetch(() => jsonResponse([]));

      renderWithToast(<PartnersPage />);
      await screen.findByText('Nenhum parceiro cadastrado.');
      fireEvent.click(screen.getByText('+ Novo parceiro'));

      const phoneInput = screen.getByLabelText(/Telefone/);
      const grid = phoneInput.closest('label')?.parentElement;
      expect(grid).toHaveClass('grid-cols-1', 'sm:grid-cols-2');
    });

    it('Dado email inválido, Quando o servidor rejeitar, Então exibe o erro no formulário (PART-01)', async () => {
      mockFetch(({ url, init }) => {
        if (url === '/api/partners' && init?.method === 'POST') {
          return errorResponse('Email inválido');
        }
        if (url.startsWith('/api/partners')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Nenhum parceiro cadastrado.');

      fireEvent.click(screen.getByText('+ Novo parceiro'));
      fireEvent.change(screen.getByLabelText(/Nome completo/), {
        target: { value: 'Dra. Carla' },
      });
      fireEvent.change(screen.getByLabelText(/Email \*/), {
        target: { value: 'carla-sem-arroba' },
      });
      fireEvent.change(screen.getByLabelText(/Telefone/), {
        target: { value: '11988887777' },
      });
      // fireEvent.click no botão respeitaria a validação nativa do
      // type="email" do browser (jsdom bloquearia o submit antes de chegar
      // no handler React) — fireEvent.submit no <form> dispara o evento
      // direto, sem passar pelo algoritmo de submissão nativo.
      fireEvent.submit(
        screen.getByText('Salvar').closest('form') as HTMLFormElement,
      );

      expect(await screen.findByText('Email inválido')).toBeInTheDocument();
    });

    it('Dado clique em editar parceiro existente, Quando o modal abre, Então preenche os campos com os dados atuais', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt1',
              fullName: 'Dr. João',
              email: 'joao@parceiro.com',
              phone: '11999999999',
              crm: 'CRM-SP 123',
              specialty: 'Vascular',
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dr. João');

      fireEvent.click(screen.getByText('Editar'));

      expect(screen.getByDisplayValue('Dr. João')).toBeInTheDocument();
      expect(screen.getByDisplayValue('joao@parceiro.com')).toBeInTheDocument();
      expect(screen.getByText('Editar parceiro')).toBeInTheDocument();
    });

    it('Dado clique em editar parceiro sem CRM ou especialidade, Quando o modal abre, Então os campos ficam vazios', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt4',
              fullName: 'Dra. Beatriz',
              email: 'beatriz@parceiro.com',
              phone: '11966666666',
              crm: null,
              specialty: null,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dra. Beatriz');

      fireEvent.click(screen.getByText('Editar'));

      const crmInput = screen.getByPlaceholderText('Ex.: CRM-SP 123456');
      const specialtyInput = screen.getByPlaceholderText(
        'Ex.: Cirurgia vascular',
      );
      expect(crmInput).toHaveValue('');
      expect(specialtyInput).toHaveValue('');
    });

    it('Dado modal de edição aberto, Quando fechado sem salvar, Então o modal desaparece', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt1',
              fullName: 'Dr. João',
              email: 'joao@parceiro.com',
              phone: '11999999999',
              crm: null,
              specialty: null,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dr. João');

      fireEvent.click(screen.getByText('Editar'));
      expect(await screen.findByText('Editar parceiro')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      await waitFor(() => {
        expect(screen.queryByText('Editar parceiro')).not.toBeInTheDocument();
      });
    });

    it('Dado edição de parceiro existente com alteração de CRM e especialidade, Quando salvo, Então envia PUT com os dados atualizados', async () => {
      let sentBody: { crm?: string | null; specialty?: string | null } = {};
      mockFetch(({ url, init }) => {
        if (url === '/api/partners/pt1' && init?.method === 'PUT') {
          sentBody = JSON.parse(String(init.body));
          return jsonResponse({ id: 'pt1', active: true });
        }
        if (url.startsWith('/api/partners')) {
          return jsonResponse([
            {
              id: 'pt1',
              fullName: 'Dr. João',
              email: 'joao@parceiro.com',
              phone: '11999999999',
              crm: null,
              specialty: null,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Dr. João');

      fireEvent.click(screen.getByText('Editar'));
      fireEvent.change(screen.getByPlaceholderText('Ex.: CRM-SP 123456'), {
        target: { value: 'CRM-SP 999' },
      });
      fireEvent.change(screen.getByPlaceholderText('Ex.: Cirurgia vascular'), {
        target: { value: 'Dermatologia' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(sentBody).toEqual(
          expect.objectContaining({
            crm: 'CRM-SP 999',
            specialty: 'Dermatologia',
          }),
        );
      });
      expect(await screen.findByText('Parceiro salvo')).toBeInTheDocument();
    });

    it('Dado erro ao salvar parceiro, Quando a chamada falha, Então exibe alerta no formulário', async () => {
      mockFetch(({ url, init }) => {
        if (url === '/api/partners' && init?.method === 'POST') {
          return errorResponse('Erro ao salvar parceiro');
        }
        if (url.startsWith('/api/partners')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Nenhum parceiro cadastrado.');

      fireEvent.click(screen.getByText('+ Novo parceiro'));
      fireEvent.change(screen.getByLabelText(/Nome completo/), {
        target: { value: 'Dra. Carla' },
      });
      fireEvent.change(screen.getByLabelText(/Email \*/), {
        target: { value: 'carla@parceiro.com' },
      });
      fireEvent.change(screen.getByLabelText(/Telefone/), {
        target: { value: '11988887777' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Erro ao salvar parceiro'),
      ).toBeInTheDocument();
    });

    it('Dado erro não padronizado ao salvar parceiro, Quando a chamada rejeita com valor que não é Error, Então exibe mensagem padrão', async () => {
      mockFetch(({ url, init }) => {
        if (url === '/api/partners' && init?.method === 'POST') {
          throw 'falha inesperada';
        }
        if (url.startsWith('/api/partners')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<PartnersPage />);
      await screen.findByText('Nenhum parceiro cadastrado.');

      fireEvent.click(screen.getByText('+ Novo parceiro'));
      fireEvent.change(screen.getByLabelText(/Nome completo/), {
        target: { value: 'Dra. Carla' },
      });
      fireEvent.change(screen.getByLabelText(/Email \*/), {
        target: { value: 'carla@parceiro.com' },
      });
      fireEvent.change(screen.getByLabelText(/Telefone/), {
        target: { value: '11988887777' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Erro ao salvar parceiro'),
      ).toBeInTheDocument();
    });
  });
});

describe('Feature: ProfessionalsPage', () => {
  describe('Cenário: listagem', () => {
    it('Dado nenhum profissional, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);

      expect(
        await screen.findByText(
          'Nenhum profissional cadastrado. Consultas e evoluções podem ser atribuídas após o cadastro.',
        ),
      ).toBeInTheDocument();
    });

    it('Dado profissionais cadastrados, Quando a página carrega, Então lista dados', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/professionals')) {
          return jsonResponse([
            {
              id: 'pr1',
              fullName: 'Dra. Ana',
              registry: 'COREN-SP 123',
              commissionPct: 10,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);

      expect(await screen.findByText('Dra. Ana')).toBeInTheDocument();
      expect(screen.getByText('COREN-SP 123')).toBeInTheDocument();
      expect(screen.getByText('Ativo')).toBeInTheDocument();
    });

    it('Dado profissional listado, Quando clicar em Horários, Então abre o editor de horário dele', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/professionals/pr1/availability')) {
          return jsonResponse({ windows: [] });
        }
        if (url.startsWith('/api/professionals')) {
          return jsonResponse([
            {
              id: 'pr1',
              fullName: 'Dra. Ana',
              registry: null,
              commissionPct: 10,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Horários' }));
      expect(
        await screen.findByRole('dialog', { name: 'Horários — Dra. Ana' }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: 'Salvar horários' }),
      ).toBeInTheDocument();
    });

    it('Dado erro ao carregar, Quando a página carrega, Então exibe alerta de erro', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/professionals'))
          return jsonResponse(null, false);
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Cenário: alternar situação', () => {
    it('Dado clique em desativar, Quando a chamada é bem-sucedida, Então recarrega a lista', async () => {
      let calls = 0;
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals/pr1' && init?.method === 'PATCH') {
          return jsonResponse({ id: 'pr1', active: false });
        }
        if (url.startsWith('/api/professionals')) {
          calls += 1;
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
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText('Dra. Ana');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
      expect(
        await screen.findByText('Profissional desativado'),
      ).toBeInTheDocument();
    });

    it("Dado clique em reativar, Quando a chamada é bem-sucedida, Então exibe toast 'Profissional ativado'", async () => {
      let calls = 0;
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals/pr3' && init?.method === 'PATCH') {
          return jsonResponse({ id: 'pr3', active: true });
        }
        if (url.startsWith('/api/professionals')) {
          calls += 1;
          return jsonResponse([
            {
              id: 'pr3',
              fullName: 'Dr. Bruno',
              registry: null,
              commissionPct: null,
              active: false,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText('Dr. Bruno');

      fireEvent.click(screen.getByText('Reativar'));

      await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
      expect(
        await screen.findByText('Profissional ativado'),
      ).toBeInTheDocument();
    });

    it('Dado erro ao alternar situação, Quando falha, Então exibe alerta de erro', async () => {
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals/pr1' && init?.method === 'PATCH') {
          return errorResponse('Erro ao atualizar profissional');
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
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText('Dra. Ana');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Erro ao atualizar profissional'),
      ).toBeInTheDocument();
    });

    it('Dado erro não padronizado ao alternar situação, Quando a chamada rejeita com valor que não é Error, Então exibe mensagem padrão', async () => {
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals/pr1' && init?.method === 'PATCH') {
          throw 'falha inesperada';
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
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText('Dra. Ana');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Erro ao atualizar profissional'),
      ).toBeInTheDocument();
    });

    it('Dado clique em desativar seguido de cancelamento no dialog, Quando acionado, Então não chama a API', async () => {
      let patchCalls = 0;
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals/pr1' && init?.method === 'PATCH') {
          patchCalls += 1;
          return jsonResponse({ id: 'pr1', active: false });
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
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText('Dra. Ana');

      fireEvent.click(screen.getByText('Desativar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(patchCalls).toBe(0);
    });
  });

  describe('Cenário: profissional inativo e edição existente', () => {
    it('Dado profissional inativo sem registro, Quando a página carrega, Então exibe situação inativa e ação de reativar', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/professionals')) {
          return jsonResponse([
            {
              id: 'pr3',
              fullName: 'Dr. Bruno',
              registry: null,
              commissionPct: null,
              active: false,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);

      expect(await screen.findByText('Dr. Bruno')).toBeInTheDocument();
      expect(screen.getByText('Inativo')).toBeInTheDocument();
      expect(screen.getByText('Reativar')).toBeInTheDocument();
      expect(screen.getAllByText('—').length).toBe(2);
    });

    it('Dado clique em editar profissional existente, Quando o modal abre, Então preenche os campos com os dados atuais', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/professionals')) {
          return jsonResponse([
            {
              id: 'pr1',
              fullName: 'Dra. Ana',
              registry: 'COREN-SP 123',
              commissionPct: 10,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText('Dra. Ana');

      fireEvent.click(screen.getByText('Editar'));

      expect(screen.getByText('Editar profissional')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Dra. Ana')).toBeInTheDocument();
      expect(screen.getByDisplayValue('COREN-SP 123')).toBeInTheDocument();
    });

    it('Dado modal de edição aberto, Quando fechado sem salvar, Então o modal desaparece', async () => {
      mockFetch(({ url }) => {
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
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText('Dra. Ana');

      fireEvent.click(screen.getByText('Editar'));
      expect(
        await screen.findByText('Editar profissional'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      await waitFor(() => {
        expect(
          screen.queryByText('Editar profissional'),
        ).not.toBeInTheDocument();
      });
    });

    it('Dado edição de profissional existente com alteração de registro, Quando salvo, Então envia PATCH com os dados atualizados', async () => {
      let sentBody: { registry?: string | null } = {};
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals/pr1' && init?.method === 'PATCH') {
          sentBody = JSON.parse(String(init.body));
          return jsonResponse({ id: 'pr1', active: true });
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
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText('Dra. Ana');

      fireEvent.click(screen.getByText('Editar'));
      fireEvent.change(screen.getByLabelText(/Registro profissional/), {
        target: { value: 'COREN-SP 456' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(sentBody).toEqual(
          expect.objectContaining({ registry: 'COREN-SP 456' }),
        );
      });
      expect(await screen.findByText('Profissional salvo')).toBeInTheDocument();
    });
  });

  describe('Cenário: criação via modal', () => {
    it('Dado clique em novo profissional e preenchimento, Quando submetido, Então cria o profissional', async () => {
      let created = false;
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals' && init?.method === 'POST') {
          created = true;
          return jsonResponse({ id: 'pr2' });
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText(
        'Nenhum profissional cadastrado. Consultas e evoluções podem ser atribuídas após o cadastro.',
      );

      fireEvent.click(screen.getByText('+ Novo profissional'));
      fireEvent.change(screen.getByLabelText(/Nome \*/), {
        target: { value: 'Dr. Pedro' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => expect(created).toBe(true));
      expect(await screen.findByText('Profissional salvo')).toBeInTheDocument();
    });

    it('Dado preenchimento com repasse, Quando submetido, Então envia commissionPct no POST (PROF-01)', async () => {
      let sentBody: Record<string, unknown> | undefined;
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals' && init?.method === 'POST') {
          sentBody = JSON.parse(String(init.body));
          return jsonResponse({ id: 'pr9' });
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText(
        'Nenhum profissional cadastrado. Consultas e evoluções podem ser atribuídas após o cadastro.',
      );

      fireEvent.click(screen.getByText('+ Novo profissional'));
      fireEvent.change(screen.getByLabelText(/Nome \*/), {
        target: { value: 'Dr. Pedro' },
      });
      fireEvent.change(screen.getByLabelText(/Repasse/), {
        target: { value: '15' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(sentBody).toEqual(
          expect.objectContaining({ commissionPct: 15 }),
        );
      });
    });

    it('Dado profissional com repasse cadastrado, Quando a tabela renderiza, Então mostra a coluna Repasse (PROF-01)', async () => {
      mockFetch(({ url }) => {
        if (url.startsWith('/api/professionals')) {
          return jsonResponse([
            {
              id: 'pr10',
              fullName: 'Dra. Sofia',
              registry: null,
              commissionType: 'percentage',
              commissionPct: 20,
              commissionFixedCents: null,
              active: true,
            },
            {
              id: 'pr11',
              fullName: 'Dr. Caio',
              registry: null,
              commissionType: 'fixed',
              commissionPct: null,
              commissionFixedCents: 5000,
              active: true,
            },
          ]);
        }
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);

      expect(await screen.findByText('Dra. Sofia')).toBeInTheDocument();
      expect(screen.getByText('20% da sessão')).toBeInTheDocument();
      expect(screen.getByText('R$ 50,00 por sessão')).toBeInTheDocument();
    });

    it('Dado tipo valor fixo, Quando submetido, Então envia commissionType fixed e o valor em centavos', async () => {
      let sentBody: Record<string, unknown> | undefined;
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals' && init?.method === 'POST') {
          sentBody = JSON.parse(String(init.body));
          return jsonResponse({ id: 'pr12' });
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText(
        'Nenhum profissional cadastrado. Consultas e evoluções podem ser atribuídas após o cadastro.',
      );

      fireEvent.click(screen.getByText('+ Novo profissional'));
      fireEvent.change(screen.getByLabelText(/Nome \*/), {
        target: { value: 'Dr. Caio' },
      });
      fireEvent.change(screen.getByLabelText('Tipo de repasse'), {
        target: { value: 'fixed' },
      });
      fireEvent.change(screen.getByLabelText(/Valor por sessão/), {
        target: { value: '50.5' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(sentBody).toMatchObject({
          commissionType: 'fixed',
          commissionFixedCents: 5050,
        });
      });
    });

    it('Dado o campo Registro, Quando renderizar, Então mostra hint persistente abaixo do input (PROF-02)', async () => {
      mockFetch(() => jsonResponse([]));

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText(
        'Nenhum profissional cadastrado. Consultas e evoluções podem ser atribuídas após o cadastro.',
      );
      fireEvent.click(screen.getByText('+ Novo profissional'));

      fireEvent.change(screen.getByLabelText(/Registro profissional/), {
        target: { value: 'COREN-SP 999' },
      });

      expect(screen.getByText('Ex.: COREN-SP 123456')).toBeInTheDocument();
    });

    it('Dado erro ao salvar profissional, Quando a chamada falha, Então exibe alerta no formulário', async () => {
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals' && init?.method === 'POST') {
          return errorResponse('Erro ao salvar profissional');
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText(
        'Nenhum profissional cadastrado. Consultas e evoluções podem ser atribuídas após o cadastro.',
      );

      fireEvent.click(screen.getByText('+ Novo profissional'));
      fireEvent.change(screen.getByLabelText(/Nome \*/), {
        target: { value: 'Dr. Pedro' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Erro ao salvar profissional'),
      ).toBeInTheDocument();
    });

    it('Dado erro não padronizado ao salvar profissional, Quando a chamada rejeita com valor que não é Error, Então exibe mensagem padrão', async () => {
      mockFetch(({ url, init }) => {
        if (url === '/api/professionals' && init?.method === 'POST') {
          throw 'falha inesperada';
        }
        if (url.startsWith('/api/professionals')) return jsonResponse([]);
        return jsonResponse(null, false);
      });

      renderWithToast(<ProfessionalsPage />);
      await screen.findByText(
        'Nenhum profissional cadastrado. Consultas e evoluções podem ser atribuídas após o cadastro.',
      );

      fireEvent.click(screen.getByText('+ Novo profissional'));
      fireEvent.change(screen.getByLabelText(/Nome \*/), {
        target: { value: 'Dr. Pedro' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Erro ao salvar profissional'),
      ).toBeInTheDocument();
    });
  });
});
