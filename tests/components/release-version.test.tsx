// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseVersion } from '@/components/release-version';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({
  apiFetch,
  ApiError: class extends Error {
    status = 500;
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  apiFetch.mockReset();
});

describe('Feature: Rodapé de versão lido da API (ADR-066)', () => {
  it('Dado a versão do banco, Quando a API responde, Então o rodapé mostra a do banco', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '0.1.0');
    apiFetch.mockResolvedValue({ version: '0.2.0', releasedAt: null });

    render(<ReleaseVersion />);

    await waitFor(() => expect(screen.getByText('v0.2.0')).toBeTruthy());
    expect(apiFetch).toHaveBeenCalledWith('/api/version');
  });

  it('Dada homologação, Quando a API traz o SHA, Então o rodapé mostra o SHA curto', async () => {
    apiFetch.mockResolvedValue({
      version: '0.2.0',
      releasedAt: null,
      sha: 'abcdef1234',
    });

    render(<ReleaseVersion />);

    await waitFor(() =>
      expect(screen.getByText('v0.2.0 (abcdef1)')).toBeTruthy(),
    );
  });

  it('Dada uma falha da API, Quando carrega, Então o rodapé usa a versão do build', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_VERSION', '0.2.0');
    apiFetch.mockRejectedValue(new Error('fora do ar'));

    render(<ReleaseVersion />);

    await waitFor(() => expect(screen.getByText('v0.2.0')).toBeTruthy());
  });
});

describe('Feature: Rodapé do portal lê a rota do portal (ADR-066)', () => {
  it('Dado o portal, Quando renderiza com a URL do portal, Então consulta /api/portal/version', async () => {
    apiFetch.mockResolvedValue({ version: '0.2.0', releasedAt: null });

    render(<ReleaseVersion url="/api/portal/version" />);

    await waitFor(() => expect(screen.getByText('v0.2.0')).toBeTruthy());
    expect(apiFetch).toHaveBeenCalledWith('/api/portal/version');
  });
});
