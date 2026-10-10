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
import PlatformTaxonomyPage from '@/app/plataforma/taxonomia/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/plataforma/taxonomia',
}));

const BUTTON = 'Importar catálogo de estomaterapia';
const CONFIRM_TITLE =
  'Importar o catálogo de estomaterapia para todas as clínicas?';
const URL = '/api/platform/taxonomy/import';

const envelope = (data: unknown, ok = true, error: string | null = null) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => ({ success: ok, data, error }),
});

const openConfirm = async () => {
  fireEvent.click(screen.getByRole('button', { name: BUTTON }));
  return within(await screen.findByRole('alertdialog'));
};

const confirmImport = async () => {
  const dialog = await openConfirm();
  fireEvent.click(dialog.getByRole('button', { name: 'Importar' }));
};

/** C4 (#267): tela de importação do catálogo curado sobre a API existente. */
describe('Feature: /plataforma/taxonomia', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('estado inicial: mostra a explicação e o botão de importar', () => {
    render(<PlatformTaxonomyPage />);

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent ===
            'Importa o catálogo curado de estomaterapia (NANDA-I, NOC, NIC e ligações). Pode ser repetido: itens existentes não são duplicados. O catálogo licenciado completo é importado por scripts/import-taxonomy.ts.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled();
  });

  it('confirmação: abre o ConfirmAction e cancelar não chama a API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<PlatformTaxonomyPage />);

    const dialog = await openConfirm();
    expect(dialog.getByText(CONFIRM_TITLE)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('contagens: confirmado, chama a API uma vez e mostra as contagens devolvidas', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        envelope({ diagnoses: 7, outcomes: 5, interventions: 6, linkages: 9 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<PlatformTaxonomyPage />);

    await confirmImport();

    expect(await screen.findByText('Diagnósticos: 7')).toBeInTheDocument();
    expect(screen.getByText('Resultados: 5')).toBeInTheDocument();
    expect(screen.getByText('Intervenções: 6')).toBeInTheDocument();
    expect(screen.getByText('Ligações: 9')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(URL);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('falha: mostra a mensagem da API e o botão volta a ficar disponível', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(envelope(null, false, 'Catálogo indisponível')),
    );
    render(<PlatformTaxonomyPage />);

    await confirmImport();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Catálogo indisponível',
    );
    expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled();
  });

  it('enquanto importa: botão desabilitado e indicador de carregamento', async () => {
    let resolve: (value: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      ),
    );
    render(<PlatformTaxonomyPage />);

    await confirmImport();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: BUTTON })).toBeDisabled(),
    );
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    resolve(
      envelope({ diagnoses: 0, outcomes: 0, interventions: 0, linkages: 0 }),
    );
    expect(await screen.findByText('Diagnósticos: 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled();
  });
});
