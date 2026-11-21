// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientPicker } from '@/components/patient-picker';

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data, error: null }),
});

function Harness() {
  const [value, setValue] = useState('');
  return (
    <>
      <PatientPicker
        value={value}
        onChange={setValue}
        label="Paciente *"
        allowQuickCreate
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** #972: cadastrar o paciente sem sair da nova consulta. */
describe('Cadastro rápido no seletor de paciente (#972)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('sem allowQuickCreate, não oferece o cadastro', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<PatientPicker value="" onChange={() => {}} label="Paciente" />);
    expect(
      screen.queryByRole('button', { name: /Cadastrar paciente/ }),
    ).not.toBeInTheDocument();
  });

  it('busca sem resultado → cadastra rápido e o paciente fica selecionado', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return ok({ id: 'p-novo', fullName: 'Ana Rápida', active: true });
        }
        return ok([]);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);

    fill('Paciente *', 'Ana Rápida');
    await screen.findByText('Nenhum paciente encontrado.');
    fireEvent.click(
      screen.getByRole('button', { name: 'Não encontrou? Cadastrar paciente' }),
    );

    expect(screen.getByLabelText('Nome completo *')).toHaveValue('Ana Rápida');
    fill('Celular *', '(11) 98888-7777');
    fill('Data de nascimento *', '1960-04-12');
    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar e selecionar' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('value')).toHaveTextContent('p-novo'),
    );
    expect(
      document.querySelector('[data-patient-picker-selected]'),
    ).toHaveTextContent('Ana Rápida');
    const post = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST',
    );
    expect(String(post?.[0])).toBe('/api/patients');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      fullName: 'Ana Rápida',
      phone: '(11) 98888-7777',
      birthDate: '1960-04-12',
      quickRegistration: true,
    });
  });

  it('valida nome, celular e nascimento antes de enviar', async () => {
    const fetchMock = vi.fn(async () => ok([]));
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Não encontrou? Cadastrar paciente' }),
    );
    const submit = () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Cadastrar e selecionar' }),
      );

    submit();
    expect(
      await screen.findByText('Informe o nome do paciente.'),
    ).toBeInTheDocument();

    fill('Nome completo *', 'Ana');
    fill('Celular *', '12');
    submit();
    expect(
      screen.queryByText('Informe o nome do paciente.'),
    ).not.toBeInTheDocument();

    fill('Celular *', '11988887777');
    submit();
    expect(
      await screen.findByText('Informe a data de nascimento do paciente.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mostra o erro da API e mantém o formulário', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          data: null,
          error: 'Telefone inválido',
        }),
      })),
    );
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Não encontrou? Cadastrar paciente' }),
    );
    fill('Nome completo *', 'Ana');
    fill('Celular *', '11988887777');
    fill('Data de nascimento *', '1960-04-12');
    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar e selecionar' }),
    );

    expect(await screen.findByText('Telefone inválido')).toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('');
  });

  it('cancelar volta para a busca', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok([])),
    );
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Não encontrou? Cadastrar paciente' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Paciente *')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome completo *')).not.toBeInTheDocument();
  });
});
