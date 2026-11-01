// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { CalendarIntegrationSection } from '@/app/(staff)/configuracoes/calendar-integration-section';
import type { CalendarIntegrationStatusDto } from '@/lib/dto';

const { searchParamsRef, toastMock } = vi.hoisted(() => ({
  searchParamsRef: { current: new URLSearchParams() },
  toastMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsRef.current,
}));

vi.mock('@still-void/ui/react/client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@still-void/ui/react/client')>();
  return { ...actual, useToast: () => ({ toast: toastMock }) };
});

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

function mockStatusFetch(status: CalendarIntegrationStatusDto) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/settings/calendar-integration')) {
        return jsonResponse(true, status);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastMock.mockClear();
  searchParamsRef.current = new URLSearchParams();
});

describe('Feature: Feedback visual da conexão do Google Agenda (issue #124)', () => {
  it('Dada clínica conectada, Quando carrega, Então mostra e-mail e data da conexão', async () => {
    mockStatusFetch({
      configured: true,
      connected: true,
      email: 'agenda@clinica.com',
      connectedAt: '2026-08-01T12:00:00.000Z',
    });

    renderWithToast(<CalendarIntegrationSection />);

    await waitFor(() => {
      expect(screen.getByText(/agenda@clinica\.com/)).toBeInTheDocument();
    });
    expect(screen.getByText('Reconectar Google Agenda')).toBeInTheDocument();
  });

  it('Dada clínica sem conexão, Quando carrega, Então mostra "Nenhuma conta conectada"', async () => {
    mockStatusFetch({
      configured: true,
      connected: false,
      email: null,
      connectedAt: null,
    });

    renderWithToast(<CalendarIntegrationSection />);

    await waitFor(() => {
      expect(screen.getByText('Nenhuma conta conectada.')).toBeInTheDocument();
    });
    expect(screen.getByText('Conectar Google Agenda')).toBeInTheDocument();
  });

  it('Dado retorno do OAuth com ?calendar=conectado, Quando monta, Então dispara toast de sucesso', async () => {
    searchParamsRef.current = new URLSearchParams('calendar=conectado');
    mockStatusFetch({
      configured: true,
      connected: true,
      email: 'a@b.com',
      connectedAt: '2026-08-01T12:00:00.000Z',
    });

    renderWithToast(<CalendarIntegrationSection />);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        description: 'Google Agenda conectado com sucesso',
        variant: 'success',
      });
    });
  });

  it('Dado retorno do OAuth com ?calendar=erro&reason=sem_credencial, Quando monta, Então dispara toast com a mensagem da allowlist', async () => {
    searchParamsRef.current = new URLSearchParams(
      'calendar=erro&reason=sem_credencial',
    );
    mockStatusFetch({
      configured: true,
      connected: false,
      email: null,
      connectedAt: null,
    });

    renderWithToast(<CalendarIntegrationSection />);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        description:
          'O Google não devolveu credencial de longa duração — revogue o acesso do EstomaSysTech na sua conta Google e conecte de novo.',
        variant: 'danger',
      });
    });
  });

  it('Dado reason fora da allowlist conhecida, Quando monta, Então dispara toast com mensagem genérica (nunca o valor bruto)', async () => {
    searchParamsRef.current = new URLSearchParams(
      'calendar=erro&reason=<script>alert(1)</script>',
    );
    mockStatusFetch({
      configured: true,
      connected: false,
      email: null,
      connectedAt: null,
    });

    renderWithToast(<CalendarIntegrationSection />);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        description:
          'Não foi possível conectar o Google Agenda. Tente novamente.',
        variant: 'danger',
      });
    });
  });

  it('Dado nenhum parâmetro calendar na URL, Quando monta, Então nenhum toast dispara', async () => {
    mockStatusFetch({
      configured: true,
      connected: false,
      email: null,
      connectedAt: null,
    });

    renderWithToast(<CalendarIntegrationSection />);

    await waitFor(() => {
      expect(screen.getByText('Nenhuma conta conectada.')).toBeInTheDocument();
    });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('Dada integração não configurada, Quando carrega, Então o botão Conectar fica desabilitado com a mensagem de não configurado e sem link (#658)', async () => {
    mockStatusFetch({
      configured: false,
      connected: false,
      email: null,
      connectedAt: null,
    });

    renderWithToast(<CalendarIntegrationSection />);

    const botao = await screen.findByRole('button', {
      name: 'Conectar Google Agenda',
    });
    expect(botao).toBeDisabled();
    expect(
      screen.getByText(
        'Integração com Google Agenda não está configurada no momento.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
