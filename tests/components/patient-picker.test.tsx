// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientPicker } from '@/components/patient-picker';

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

function mockFetch(respond: (url: string) => unknown) {
  const fn = vi.fn(async (input: RequestInfo | URL) => respond(String(input)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PatientPicker value={value} onChange={setValue} label="Paciente *" />
      <output data-testid="value">{value}</output>
    </>
  );
}

/** Issue #197: seleção de paciente por busca, sem depender da 1ª página. */
describe('PatientPicker (#197)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('C32 busca assíncrona e seleção', async () => {
    const fetchMock = mockFetch(() =>
      ok([
        { id: 'p-150', fullName: 'Zuleica Paciente 150', active: true },
        { id: 'p-old', fullName: 'Zuleica Inativa', active: false },
      ]),
    );
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('Paciente *'), {
      target: { value: 'Zuleica' },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Zuleica Paciente 150' }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patients?search=Zuleica&limit=20',
      expect.anything(),
    );
    expect(screen.queryByText('Zuleica Inativa')).not.toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('p-150');
    expect(
      document.querySelector('[data-patient-picker-selected]'),
    ).toHaveTextContent('Zuleica Paciente 150');

    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    expect(screen.getByTestId('value')).toHaveTextContent('');
    expect(screen.getByLabelText('Paciente *')).toHaveValue('');
  });

  it('com menos de 2 letras não busca; sem resultado avisa', async () => {
    const fetchMock = mockFetch(() => ok([]));
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('Paciente *'), {
      target: { value: 'Z' },
    });
    expect(screen.getByText(/Digite ao menos 2 letras/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Paciente *'), {
      target: { value: 'Zz' },
    });
    expect(
      await screen.findByText('Nenhum paciente encontrado.'),
    ).toBeInTheDocument();
  });

  it('erro da busca aparece sob o campo', async () => {
    mockFetch(() => ({
      ok: false,
      json: async () => ({ success: false, data: null, error: 'Falhou' }),
    }));
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('Paciente *'), {
      target: { value: 'Maria' },
    });

    expect(await screen.findByText('Falhou')).toBeInTheDocument();
  });

  it('paciente pré-selecionado mostra o nome lido da ficha', async () => {
    const fetchMock = mockFetch(() =>
      ok({ id: 'p-9', fullName: 'Maria Pré', active: true }),
    );
    render(<Harness initial="p-9" />);

    expect(await screen.findByText('Maria Pré')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patients/p-9',
      expect.anything(),
    );
  });

  it('includeInactive mostra inativos marcados', async () => {
    mockFetch(() =>
      ok([{ id: 'p-old', fullName: 'Zuleica Inativa', active: false }]),
    );
    render(
      <PatientPicker
        value=""
        onChange={() => {}}
        label="Filtrar"
        includeInactive
      />,
    );

    fireEvent.change(screen.getByLabelText('Filtrar'), {
      target: { value: 'Zu' },
    });

    expect(
      await screen.findByRole('button', { name: 'Zuleica Inativa (inativo)' }),
    ).toBeInTheDocument();
  });
});
