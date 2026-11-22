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
import { PatientForm } from '@/app/(staff)/pacientes/patient-form';
import { PatientPicker } from '@/components/patient-picker';
import { PossibleDuplicatesNotice } from '@/components/possible-duplicates-notice';
import type { PatientDto } from '@/lib/dto';

const mocks = vi.hoisted(() => ({ findPossibleDuplicatePatients: vi.fn() }));
vi.mock('@/app/(staff)/pacientes/actions', () => ({
  findPossibleDuplicatePatients: mocks.findPossibleDuplicatePatients,
}));

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data, error: null }),
});

const existing = {
  id: 'p-ana',
  fullName: 'Ana Rápida',
  phone: '+5511988887777',
  birthDate: '1960-04-12',
  active: true,
} as PatientDto;

function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.findPossibleDuplicatePatients.mockReset();
});

describe('Feature: aviso de paciente repetido (#992)', () => {
  it('mostra nascimento, final do celular e inativo; sem ação para quem não pode ser usado', () => {
    const onUse = vi.fn();
    render(
      <PossibleDuplicatesNotice
        duplicates={[
          existing,
          { ...existing, id: 'p-old', birthDate: null, active: false },
        ]}
        onUse={onUse}
        onCreateAnyway={() => {}}
        canUse={(p) => p.active}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(
      'Ana Rápida · nasc. 12/04/1960 · cel. final 7777',
    );
    expect(items[1]).toHaveTextContent(
      'Ana Rápida · cel. final 7777 (inativo)',
    );
    expect(
      screen.getAllByRole('button', { name: 'Usar este paciente' }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Usar este paciente' }));
    expect(onUse).toHaveBeenCalledWith(existing);
  });

  it('com hrefFor, "Usar este paciente" leva à ficha', () => {
    render(
      <PossibleDuplicatesNotice
        duplicates={[existing]}
        hrefFor={(p) => `/pacientes/${p.id}`}
        onCreateAnyway={() => {}}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Usar este paciente' }),
    ).toHaveAttribute('href', '/pacientes/p-ana');
  });

  it('sem onUse nem hrefFor, só lista', () => {
    render(
      <PossibleDuplicatesNotice
        duplicates={[existing]}
        onCreateAnyway={() => {}}
      />,
    );
    expect(screen.queryByText('Usar este paciente')).not.toBeInTheDocument();
  });
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

async function openQuickForm(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  render(<Harness />);
  fill('Paciente *', 'Ana Rápida');
  await screen.findByText('Nenhum paciente encontrado.');
  fireEvent.click(
    screen.getByRole('button', { name: 'Não encontrou? Cadastrar paciente' }),
  );
  fill('Celular *', '(11) 98888-7777');
  fill('Data de nascimento *', '1960-04-12');
}

const quickFetch = (duplicates: unknown) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/patients/duplicates') return ok(duplicates);
    if (init?.method === 'POST') {
      return ok({ id: 'p-novo', fullName: 'Ana Rápida', active: true });
    }
    return ok([]);
  });

const posts = (fetchMock: ReturnType<typeof vi.fn>, url: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) => String(input) === url && init?.method === 'POST',
  );

describe('Feature: cadastro rápido com paciente repetido (#992)', () => {
  it('Dado repetido, Quando usar o existente, Então seleciona sem cadastrar', async () => {
    const fetchMock = quickFetch([existing]);
    await openQuickForm(fetchMock);
    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar e selecionar' }),
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Usar este paciente' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('value')).toHaveTextContent('p-ana'),
    );
    expect(posts(fetchMock, '/api/patients')).toHaveLength(0);
    expect(
      JSON.parse(
        String(posts(fetchMock, '/api/patients/duplicates')[0][1]?.body),
      ),
    ).toEqual({
      fullName: 'Ana Rápida',
      phone: '(11) 98888-7777',
      birthDate: '1960-04-12',
    });
  });

  it('Dado repetido, Quando cadastrar mesmo assim, Então cria o novo', async () => {
    const fetchMock = quickFetch([existing]);
    await openQuickForm(fetchMock);
    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar e selecionar' }),
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadastrar mesmo assim' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('value')).toHaveTextContent('p-novo'),
    );
  });

  it('Dado campo alterado depois do aviso, Então confere de novo', async () => {
    const fetchMock = quickFetch([existing]);
    await openQuickForm(fetchMock);
    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar e selecionar' }),
    );
    await screen.findByRole('button', { name: 'Cadastrar mesmo assim' });

    fill('Celular *', '(11) 97777-6666');

    expect(screen.queryByText('Cadastrar mesmo assim')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar e selecionar' }),
    );
    await screen.findByRole('button', { name: 'Cadastrar mesmo assim' });
    expect(posts(fetchMock, '/api/patients/duplicates')).toHaveLength(2);
  });

  it('Dado a conferência falhando, Então cadastra como antes', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/patients/duplicates') {
          throw new Error('rede caiu');
        }
        if (init?.method === 'POST') {
          return ok({ id: 'p-novo', fullName: 'Ana Rápida', active: true });
        }
        return ok([]);
      },
    );
    await openQuickForm(fetchMock);
    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar e selecionar' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('value')).toHaveTextContent('p-novo'),
    );
  });

  it('Dado nascimento no futuro, Então avisa e não envia', async () => {
    const fetchMock = quickFetch([]);
    await openQuickForm(fetchMock);
    expect(screen.getByLabelText('Data de nascimento *')).toHaveAttribute(
      'max',
    );
    fill('Data de nascimento *', '2999-01-01');
    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar e selecionar' }),
    );

    expect(
      await screen.findByText('A data de nascimento não pode ser no futuro.'),
    ).toBeInTheDocument();
    expect(posts(fetchMock, '/api/patients/duplicates')).toHaveLength(0);
  });
});

function fillFullForm() {
  fill(/Nome completo/, 'Ana Rápida');
  fill(/Telefone/, '(11) 98888-7777');
}

describe('Feature: cadastro completo com paciente repetido (#992)', () => {
  it('Dado repetido, Então avisa com link para a ficha e só cadastra ao confirmar', async () => {
    mocks.findPossibleDuplicatePatients.mockResolvedValue({
      success: true,
      data: [existing],
      error: null,
    });
    const onSubmit = vi.fn(async () => {});
    render(
      <PatientForm
        partners={[]}
        onSubmit={onSubmit}
        existingPatientHref={(p) => `/pacientes/${p.id}`}
      />,
    );
    fillFullForm();
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByRole('link', { name: 'Usar este paciente' }),
    ).toHaveAttribute('href', '/pacientes/p-ana');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar mesmo assim' }),
    );
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('Dado a conferência recusada, Então cadastra como antes', async () => {
    mocks.findPossibleDuplicatePatients.mockResolvedValue({
      success: false,
      data: null,
      error: 'Não autenticado',
    });
    const onSubmit = vi.fn(async () => {});
    render(
      <PatientForm
        partners={[]}
        onSubmit={onSubmit}
        existingPatientHref={(p) => `/pacientes/${p.id}`}
      />,
    );
    fillFullForm();
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('Dado edição, Então não confere repetidos', async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <PatientForm
        initial={{ ...existing, email: null, notes: null } as PatientDto}
        partners={[]}
        onSubmit={onSubmit}
        existingPatientHref={(p) => `/pacientes/${p.id}`}
      />,
    );
    fill(/Nome completo/, 'Ana Rápida Silva');
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(mocks.findPossibleDuplicatePatients).not.toHaveBeenCalled();
  });

  it('Dado nascimento no futuro, Então marca o campo e não salva', () => {
    const onSubmit = vi.fn(async () => {});
    render(<PatientForm partners={[]} onSubmit={onSubmit} />);
    fillFullForm();
    fill(/Data de nascimento/, '2999-01-01');
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A data de nascimento não pode ser no futuro.',
    );
    expect(screen.getByLabelText(/Data de nascimento/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
