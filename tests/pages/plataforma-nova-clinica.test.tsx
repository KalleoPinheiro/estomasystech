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

  it('C2/#265 link de convite: após criar, mostra o link somente leitura, o botão Copiar link e o aviso de validade', async () => {
    const inviteUrl =
      'https://app.estomasystech.test/definir-senha?token=segredo-1';
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        clinic: { id: 'nova-1', name: 'Clínica Nova' },
        admin: { email: 'admin@nova.com', delivered: false, inviteUrl },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderWithToast(<NewClinicPage />);

    fillForm();
    fireEvent.click(
      screen.getByRole('button', { name: 'Criar clínica e convidar admin' }),
    );

    const field = await screen.findByLabelText(
      'Link de convite do primeiro admin',
    );
    expect(field).toHaveValue(inviteUrl);
    expect(field).toHaveAttribute('readonly');
    expect(
      screen.getByText(
        'Envie este link ao administrador da clínica. Ele vale por 24 horas e só pode ser usado uma vez.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(inviteUrl));
    expect(
      screen.getByRole('link', { name: 'Abrir a clínica' }),
    ).toHaveAttribute('href', '/plataforma/clinicas/nova-1');
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
    expect(screen.queryByText('Copiar link')).not.toBeInTheDocument();
  });
});
