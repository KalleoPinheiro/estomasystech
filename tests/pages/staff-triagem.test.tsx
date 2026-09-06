// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import TriagePage from '@/app/(staff)/triagem/page';
import type { TriagePhotoDto } from '@/lib/dto';

const triageFixture: TriagePhotoDto = {
  id: 'photo-1',
  conditionTitle: 'Ferida perna E',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  patientNote: 'Está coçando',
  createdAt: '2026-07-18T10:00:00.000Z',
  waitingHours: 2,
  latestScore: null,
};

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

function mockFetch(
  options: { triage?: TriagePhotoDto[]; triageError?: string } = {},
) {
  const { triage = [], triageError } = options;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url.startsWith('/api/photos/triage')) {
        return triageError
          ? jsonResponse(false, null, triageError)
          : jsonResponse(true, triage);
      }
      if (url.startsWith('/api/photos/') && method === 'PATCH') {
        return jsonResponse(true, { ok: true });
      }
      throw new Error(`URL não mapeada no mock: ${method} ${url}`);
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Página de triagem (/triagem, issue #135)', () => {
  it('Dado carregando, Quando renderizar, Então exibe indicador de carregamento', () => {
    mockFetch();
    renderWithToast(<TriagePage />);

    expect(screen.getByText('Carregando…')).toBeInTheDocument();
  });

  it('Dado falha na API, Quando renderizar, Então exibe alerta de erro com retry', async () => {
    mockFetch({ triageError: 'Erro ao buscar fila de triagem' });
    renderWithToast(<TriagePage />);

    await screen.findByText('Erro ao buscar fila de triagem');
    const callsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => {
      expect(
        (fetch as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThan(callsBefore);
    });
  });

  it('Dado fila vazia, Quando renderizar, Então exibe estado vazio', async () => {
    mockFetch();
    renderWithToast(<TriagePage />);

    await waitFor(() => {
      expect(
        screen.getByText('Nenhuma foto aguardando triagem.'),
      ).toBeInTheDocument();
    });
  });

  it('Dado muitas fotos aguardando triagem, Quando renderizar, Então lista todas (sem cap, diferente do resumo no dashboard)', async () => {
    const photos = Array.from({ length: 12 }, (_, i) => ({
      ...triageFixture,
      id: `photo-${i}`,
      patientName: `Paciente ${i}`,
    }));
    mockFetch({ triage: photos });
    renderWithToast(<TriagePage />);

    await waitFor(() => {
      expect(
        screen.getAllByText(/^Paciente \d+ — Ferida perna E$/),
      ).toHaveLength(12);
    });
  });

  it("Dado clique em 'Ok, manter plano', Quando confirmado, Então envia triagem reviewed", async () => {
    mockFetch({ triage: [triageFixture] });
    renderWithToast(<TriagePage />);

    await waitFor(() => {
      expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Ok, manter plano'));
    fireEvent.click(await screen.findByText('Confirmar'));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/photos/photo-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ triage: 'reviewed' }),
        }),
      );
    });
    expect(await screen.findByText('Foto revisada')).toBeInTheDocument();
  });

  it('Dado clique na miniatura, Quando acionado, Então abre a foto ampliada em um modal', async () => {
    mockFetch({ triage: [triageFixture] });
    renderWithToast(<TriagePage />);

    const thumbnail = await screen.findByRole('button', {
      name: 'Ampliar foto de Maria Souza',
    });
    fireEvent.click(thumbnail);

    expect(
      await screen.findByRole('heading', { name: 'Foto de Maria Souza' }),
    ).toBeInTheDocument();
  });

  it('Dado foto ampliada, Quando fechar o modal, Então volta pra lista', async () => {
    mockFetch({ triage: [triageFixture] });
    renderWithToast(<TriagePage />);

    const thumbnail = await screen.findByRole('button', {
      name: 'Ampliar foto de Maria Souza',
    });
    fireEvent.click(thumbnail);
    await screen.findByRole('heading', { name: 'Foto de Maria Souza' });

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Foto de Maria Souza' }),
      ).not.toBeInTheDocument();
    });
  });
});
