// @vitest-environment jsdom

import { ToastProvider } from '@still-void/ui/react/client';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConvertToCompanySection } from '@/app/(staff)/configuracoes/convert-to-company-section';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/client', () => api);

afterEach(() => {
  cleanup();
  api.apiFetch.mockReset();
});

const renderSection = (onDone = vi.fn()) => {
  render(
    <ToastProvider>
      <ConvertToCompanySection onDone={onDone} />
    </ToastProvider>,
  );
  return onDone;
};

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Feature: tela da troca de CPF por CNPJ (#986)', () => {
  it('pede confirmação e então troca', async () => {
    api.apiFetch.mockResolvedValue({});
    const onDone = renderSection();
    fill(/CNPJ/, '12.345.678/0001-95');
    fill(/Razão social/, 'Estoma Saúde Ltda');
    fireEvent.click(
      screen.getByRole('button', { name: 'Trocar CPF por CNPJ' }),
    );
    expect(api.apiFetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Confirma a troca/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar troca para CNPJ' }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = api.apiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/settings/clinic-info/cnpj');
    expect(JSON.parse(init.body as string)).toEqual({
      cnpj: '12.345.678/0001-95',
      name: 'Estoma Saúde Ltda',
    });
  });

  it('mexer no campo desfaz a confirmação; razão social vazia vai como null', async () => {
    api.apiFetch.mockResolvedValue({});
    renderSection();
    fill(/CNPJ/, '12.345.678/0001-95');
    fireEvent.click(
      screen.getByRole('button', { name: 'Trocar CPF por CNPJ' }),
    );
    fill(/Razão social/, ' ');
    expect(screen.queryByText(/Confirma a troca/)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Trocar CPF por CNPJ' }),
    );
    fill(/CNPJ/, '12.345.678/0001-95 ');
    expect(screen.queryByText(/Confirma a troca/)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Trocar CPF por CNPJ' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar troca para CNPJ' }),
    );
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalled());
    const [, init] = api.apiFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).name).toBeNull();
  });

  it('mostra o erro e volta ao primeiro passo', async () => {
    api.apiFetch.mockRejectedValue(
      new Error('Já existe clínica com este CNPJ'),
    );
    const onDone = renderSection();
    fill(/CNPJ/, '12.345.678/0001-95');
    fireEvent.click(
      screen.getByRole('button', { name: 'Trocar CPF por CNPJ' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar troca para CNPJ' }),
    );
    expect(
      await screen.findByText('Já existe clínica com este CNPJ'),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Trocar CPF por CNPJ' }),
    ).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('erro sem mensagem vira texto padrão', async () => {
    api.apiFetch.mockRejectedValue('falhou');
    renderSection();
    fill(/CNPJ/, '12.345.678/0001-95');
    fireEvent.click(
      screen.getByRole('button', { name: 'Trocar CPF por CNPJ' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar troca para CNPJ' }),
    );
    expect(await screen.findByText('Erro ao trocar para CNPJ')).toBeTruthy();
  });
});
