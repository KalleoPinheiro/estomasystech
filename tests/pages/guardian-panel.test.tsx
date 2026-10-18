// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuardianPanel } from '@/app/(staff)/pacientes/[id]/guardian-panel';
import type { GuardianDto, PatientDto } from '@/lib/dto';
import { renderWithToast } from '../support/render-with-toast';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

const ANA: GuardianDto = {
  id: 'g-1',
  fullName: 'Ana Souza',
  relationship: 'filho',
  relationshipLabel: 'Filho(a)',
  phone: '+5511999990000',
  email: 'ana@exemplo.com',
};

const patient = (guardian: GuardianDto | null): PatientDto => ({
  id: 'pat-1',
  fullName: 'José Silva',
  email: null,
  cpfMasked: null,
  phone: '+5511988880000',
  phoneNeedsCorrection: false,
  birthDate: null,
  notes: null,
  referredByPartnerId: null,
  guardianId: guardian?.id ?? null,
  guardianPortalRevokedAt: null,
  guardian,
  active: true,
  anonymized: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

interface Call {
  url: string;
  method: string;
  body: unknown;
}

const envelope = (data: unknown, ok = true, error: string | null = null) => ({
  ok,
  status: ok ? 200 : 409,
  json: async () => ({ success: ok, data, error }),
});

/** Responde cada rota; guarda as chamadas. `fail` faz a rota devolver erro. */
function mockApi(opts: { role?: string; fail?: string } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      if (url === '/api/auth/identity') {
        return envelope(identityFor((opts.role ?? 'atendente') as never));
      }
      if (opts.fail && url.startsWith(opts.fail) && method !== 'GET') {
        return envelope(
          null,
          false,
          'Este responsável ainda está ligado a pacientes.',
        );
      }
      if (url === '/api/guardians' && method === 'GET') {
        return envelope([ANA, { ...ANA, id: 'g-2', fullName: 'Bia Lima' }]);
      }
      if (url === '/api/guardians' && method === 'POST') {
        return envelope({ ...ANA, id: 'g-new', fullName: 'Nova Pessoa' });
      }
      return envelope({});
    }),
  );
  return calls;
}

const mutations = (calls: Call[]) =>
  calls.filter((c) => c.method !== 'GET' && c.url !== '/api/auth/identity');

const renderPanel = (
  guardian: GuardianDto | null,
  onChanged = vi.fn(),
  overrides: Partial<PatientDto> = {},
) => {
  renderWithToast(
    <WithStaffIdentity>
      <GuardianPanel
        patient={{ ...patient(guardian), ...overrides }}
        onChanged={onChanged}
      />
    </WithStaffIdentity>,
  );
  return onChanged;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Responsável na ficha do paciente (#329)', () => {
  it('Dado paciente com responsável, Então mostra nome, parentesco, telefone e e-mail', async () => {
    mockApi();
    renderPanel(ANA);

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText(/Filho\(a\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(11\) 99999-0000/)).toBeInTheDocument();
    expect(screen.getByText(/ana@exemplo.com/)).toBeInTheDocument();
  });

  it('Dado Profissional, Então vê o responsável sem botões; sem responsável, o painel some', async () => {
    mockApi({ role: 'profissional' });
    renderPanel(ANA);
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull(),
    );
    cleanup();

    mockApi({ role: 'profissional' });
    renderPanel(null);
    await waitFor(() =>
      expect(screen.queryByText('Responsável ou cuidador')).toBeNull(),
    );
  });

  it('Dado paciente sem responsável, Quando vincular um existente, Então PUT no paciente e atualiza a ficha', async () => {
    const calls = mockApi();
    const onChanged = renderPanel(null);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Vincular responsável' }),
    );
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByText(/Bia Lima/)).toBeInTheDocument(),
    );
    fireEvent.change(within(dialog).getByRole('combobox'), {
      target: { value: 'g-2' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vincular' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mutations(calls)).toEqual([
      {
        url: '/api/patients/pat-1',
        method: 'PUT',
        body: { guardianId: 'g-2' },
      },
    ]);
  });

  it('Dado paciente sem responsável, Quando cadastrar um novo, Então valida o telefone, cria e vincula', async () => {
    const calls = mockApi();
    const onChanged = renderPanel(null);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Vincular responsável' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadastrar novo responsável' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Nome completo/), {
      target: { value: 'Nova Pessoa' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Telefone/), {
      target: { value: '99999-0000' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText(/DDD/)).toBeInTheDocument();
    expect(mutations(calls)).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText(/Telefone/), {
      target: { value: '(11) 99999-0000' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mutations(calls).map((c) => [c.method, c.url])).toEqual([
      ['POST', '/api/guardians'],
      ['PUT', '/api/patients/pat-1'],
    ]);
    expect(mutations(calls)[0].body).toMatchObject({
      fullName: 'Nova Pessoa',
      relationship: 'mae',
      email: null,
    });
    expect(mutations(calls)[1].body).toEqual({ guardianId: 'g-new' });
  });

  it('Dado responsável, Quando editar, Então PUT no cadastro dele', async () => {
    const calls = mockApi();
    const onChanged = renderPanel(ANA);

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Nome completo/), {
      target: { value: 'Ana Maria Souza' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mutations(calls)).toHaveLength(1);
    expect(mutations(calls)[0]).toMatchObject({
      method: 'PUT',
      url: '/api/guardians/g-1',
      body: { fullName: 'Ana Maria Souza' },
    });
  });

  it('Dado responsável, Quando trocar, Então abre o seletor', async () => {
    mockApi();
    renderPanel(ANA);

    fireEvent.click(await screen.findByRole('button', { name: 'Trocar' }));

    expect(await screen.findByText('Vincular responsável')).toBeInTheDocument();
  });

  it('Dado responsável, Quando desvincular e confirmar, Então PUT com guardianId null', async () => {
    const calls = mockApi();
    const onChanged = renderPanel(ANA);

    fireEvent.click(await screen.findByRole('button', { name: 'Desvincular' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Desvincular',
      }),
    );

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mutations(calls)).toEqual([
      { url: '/api/patients/pat-1', method: 'PUT', body: { guardianId: null } },
    ]);
  });

  it('Dado responsável, Quando excluir o cadastro, Então desvincula e apaga', async () => {
    const calls = mockApi();
    const onChanged = renderPanel(ANA);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Excluir cadastro' }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Excluir',
      }),
    );

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mutations(calls).map((c) => [c.method, c.url])).toEqual([
      ['PUT', '/api/patients/pat-1'],
      ['DELETE', '/api/guardians/g-1'],
    ]);
  });

  it('Dado outro paciente ainda ligado, Quando excluir, Então mostra o aviso do servidor e atualiza a ficha', async () => {
    mockApi({ fail: '/api/guardians/g-1' });
    const onChanged = renderPanel(ANA);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Excluir cadastro' }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Excluir',
      }),
    );

    expect(
      await screen.findByText(/ainda está ligado a pacientes/),
    ).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it('Dado falha ao vincular, Então o seletor mostra o erro e continua aberto', async () => {
    mockApi({ fail: '/api/patients' });
    renderPanel(null);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Vincular responsável' }),
    );
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByText(/Bia Lima/)).toBeInTheDocument(),
    );
    fireEvent.change(within(dialog).getByRole('combobox'), {
      target: { value: 'g-1' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vincular' }));

    expect(
      await within(dialog).findByText(/ainda está ligado a pacientes/),
    ).toBeInTheDocument();
  });

  it('Dado paciente que encerrou o acesso, Então a equipe vê a data e como conceder de novo', async () => {
    mockApi();
    renderPanel(ANA, vi.fn(), {
      guardianPortalRevokedAt: '2026-10-18T10:00:00.000Z',
    });

    expect(
      await screen.findByText(/O paciente encerrou o acesso deste responsável/),
    ).toBeInTheDocument();
  });
});
