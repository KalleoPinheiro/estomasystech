// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NewClinicPage from '@/app/plataforma/clinicas/nova/page';
import { renderWithToast } from '../support/render-with-toast';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/plataforma/clinicas/nova',
}));

const envelope = (data: unknown, ok = true, error: string | null = null) => ({
  ok,
  status: ok ? 200 : 400,
  json: async () => ({ success: ok, data, error }),
});

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: false }), {
    target: { value },
  });

const fillForm = () => {
  fill('Razão social', 'Clínica Nova');
  fill('CNPJ', '12.345.678/0001-95');
  fill('Telefone/WhatsApp de contato', '11 3333-4444');
  fill('E-mail de contato', 'contato@nova.com');
  fill('Responsável técnico', 'Enf. Ana');
  fill('Registro profissional', 'COREN-SP 1');
  fill('E-mail do primeiro admin', 'admin@nova.com');
};

describe('Feature: Nova clínica pela plataforma (B4, Journey 3)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    push.mockReset();
  });

  it('Dado o formulário preenchido, Quando criar, Então cria e abre o detalhe da clínica', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        clinic: { id: 'nova-1' },
        admin: { email: 'admin@nova.com', delivered: true },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithToast(<NewClinicPage />);

    fillForm();
    fireEvent.click(
      screen.getByRole('button', { name: 'Criar clínica e convidar admin' }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/plataforma/clinicas/nova-1'),
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/platform/clinics');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      name: 'Clínica Nova',
      cnpj: '12.345.678/0001-95',
      contactPhone: '11 3333-4444',
      contactEmail: 'contato@nova.com',
      professionalName: 'Enf. Ana',
      professionalRegistry: 'COREN-SP 1',
      adminEmail: 'admin@nova.com',
    });
  });

  it('Dada recusa da API, Quando criar, Então mostra o erro e fica na tela', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          envelope(null, false, 'Já existe clínica com este CNPJ'),
        ),
    );
    renderWithToast(<NewClinicPage />);

    fillForm();
    fireEvent.click(
      screen.getByRole('button', { name: 'Criar clínica e convidar admin' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe clínica com este CNPJ',
    );
    expect(push).not.toHaveBeenCalled();
  });
});
