// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import SettingsPage from '@/app/(staff)/configuracoes/page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const existing = {
  id: 'a1',
  email: 'admin@clinica.test',
  role: 'company_admin',
  professionalId: null,
  active: true,
  anonymized: false,
};
const created = {
  ...existing,
  id: 'a2',
  email: 'nova@clinica.test',
  role: 'atendente',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: conta recém-convidada aparece na lista (QA staging)', () => {
  it('Dado que a nova busca ainda traz a lista antiga, Quando convidar, Então a conta já está na tabela', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const data =
          init?.method === 'POST'
            ? { ...created, delivered: true, inviteUrl: null }
            : url.startsWith('/api/accounts')
              ? [existing]
              : url.startsWith('/api/settings/schedule/closures') ||
                  url.startsWith('/api/professionals')
                ? []
                : null;
        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
        });
      }),
    );
    renderWithToast(<SettingsPage />);
    await screen.findByText('admin@clinica.test');

    fireEvent.click(screen.getByText('+ Nova conta'));
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: 'nova@clinica.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() =>
      expect(screen.getByText('nova@clinica.test')).toBeInTheDocument(),
    );
  });
});
