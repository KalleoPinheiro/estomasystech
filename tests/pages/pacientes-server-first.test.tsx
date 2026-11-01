// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PatientsPage from '@/app/(staff)/pacientes/page';
import { ValidationError } from '@/domain/shared/errors';
import type { PartnerDto, PatientDto } from '@/lib/dto';
import { renderServerPage } from '../support/server-page';

const mocks = vi.hoisted(() => ({
  requireStaffPageFor: vi.fn(),
  listPatientsPage: vi.fn(),
  listPartnersFor: vi.fn(),
  createPatient: vi.fn(),
}));

vi.mock('@/lib/server/session', () => ({
  requireStaffPageFor: mocks.requireStaffPageFor,
}));
vi.mock('@/lib/server/data/patients', () => ({
  listPatientsPage: mocks.listPatientsPage,
}));
vi.mock('@/lib/server/data/partners', () => ({
  listPartnersFor: mocks.listPartnersFor,
}));
vi.mock('@/app/(staff)/pacientes/actions', () => ({
  createPatient: mocks.createPatient,
}));

const patient = (id: string, fullName: string): PatientDto => ({
  id,
  fullName,
  email: null,
  phone: '11988887777',
  phoneNeedsCorrection: false,
  cpfMasked: null,
  birthDate: null,
  notes: null,
  referredByPartnerId: null,
  guardianId: null,
  guardianPortalRevokedAt: null,
  active: true,
  anonymized: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const partner: PartnerDto = {
  id: 'partner-1',
  fullName: 'Dr. João',
  email: 'joao@parceiro.com',
  phone: '11999999999',
  crm: null,
  specialty: null,
  active: true,
};

const envelope = (data: unknown, nextCursor: string | null = null) => ({
  ok: true,
  status: 200,
  json: async () => ({
    success: true,
    data,
    error: null,
    meta: { nextCursor },
  }),
});

function serve(options: {
  items?: PatientDto[];
  nextCursor?: string | null;
  listError?: string;
}) {
  mocks.requireStaffPageFor.mockResolvedValue({
    role: 'atendente',
    subject: 'recepcao@clinica.com',
  });
  mocks.listPatientsPage.mockImplementation(async () => {
    if (options.listError) throw new ValidationError(options.listError);
    return {
      items: options.items ?? [],
      nextCursor: options.nextCursor ?? null,
    };
  });
  mocks.listPartnersFor.mockResolvedValue([partner]);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Feature: lista de pacientes lida no servidor (#549)', () => {
  it('Dado a página renderizada pelo servidor, Quando monta no navegador, Então mostra os pacientes sem nenhuma chamada /api', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    serve({ items: [patient('p1', 'Maria Souza'), patient('p2', 'Ana Lima')] });

    await renderServerPage(PatientsPage);

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('Ana Lima')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dado a sessão da recepção, Quando lê a 1ª página, Então pede 100 pacientes no escopo da sessão', async () => {
    serve({});

    await renderServerPage(PatientsPage);

    expect(mocks.listPatientsPage).toHaveBeenCalledWith(
      { role: 'atendente', subject: 'recepcao@clinica.com' },
      { limit: 100 },
    );
    expect(mocks.requireStaffPageFor).toHaveBeenCalledWith('/pacientes');
  });

  it('Dado mais pacientes que a 1ª página, Quando clica em «Carregar mais», Então a próxima página vem da API pelo cursor e é anexada', async () => {
    const fetchMock = vi.fn(async () =>
      envelope([patient('p3', 'Zélia Costa')]),
    );
    vi.stubGlobal('fetch', fetchMock);
    serve({ items: [patient('p1', 'Maria Souza')], nextCursor: 'cursor-1' });
    await renderServerPage(PatientsPage);

    fireEvent.click(await screen.findByText('Carregar mais'));

    expect(await screen.findByText('Zélia Costa')).toBeInTheDocument();
    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patients?limit=100&cursor=cursor-1',
      expect.anything(),
    );
  });

  it('Dado busca digitada, Quando o debounce expira, Então a busca vai à API e a lista do servidor é substituída', async () => {
    const fetchMock = vi.fn(async () =>
      envelope([patient('p9', 'Beatriz Alves')]),
    );
    vi.stubGlobal('fetch', fetchMock);
    serve({ items: [patient('p1', 'Maria Souza')] });
    await renderServerPage(PatientsPage);
    await screen.findByText('Maria Souza');

    fireEvent.change(
      screen.getByPlaceholderText('Buscar por nome, email ou telefone…'),
      { target: { value: 'Bea' } },
    );

    expect(await screen.findByText('Beatriz Alves')).toBeInTheDocument();
    expect(screen.queryByText('Maria Souza')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patients?search=Bea&limit=100',
      expect.anything(),
    );
  });

  it('Dado falha na leitura do servidor, Quando a página monta, Então a lista busca na API como antes em vez de derrubar a tela', async () => {
    const fetchMock = vi.fn(async () =>
      envelope([patient('p1', 'Maria Souza')]),
    );
    vi.stubGlobal('fetch', fetchMock);
    serve({ listError: 'Banco indisponível' });

    await renderServerPage(PatientsPage);

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patients?limit=100',
      expect.anything(),
    );
  });

  it('Dado o formulário de novo paciente, Quando o servidor lista parceiros, Então eles são as opções de indicação sem chamar /api/partners', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    serve({});
    await renderServerPage(PatientsPage);

    fireEvent.click(await screen.findByText('+ Novo paciente'));

    expect(await screen.findByText('Dr. João')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dado cadastro recusado pela ação, Quando salvar, Então mostra a mensagem do servidor, mantém o formulário e não recarrega a lista', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    serve({});
    mocks.createPatient.mockResolvedValue({
      success: false,
      data: null,
      error: 'CPF já cadastrado',
    });
    await renderServerPage(PatientsPage);
    fireEvent.click(await screen.findByText('+ Novo paciente'));
    fireEvent.change(screen.getByLabelText(/Nome completo/), {
      target: { value: 'Ana Lima' },
    });
    fireEvent.change(screen.getByLabelText(/Telefone \*/), {
      target: { value: '11977776666' },
    });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      expect(screen.getAllByText('CPF já cadastrado').length).toBeGreaterThan(
        0,
      );
    });
    expect(screen.getByText('Novo paciente')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dado cadastro aceito, Quando salvar, Então fecha o formulário e recarrega a lista pela API', async () => {
    const fetchMock = vi.fn(async () =>
      envelope([patient('p1', 'Maria Souza'), patient('p5', 'Ana Lima')]),
    );
    vi.stubGlobal('fetch', fetchMock);
    serve({ items: [patient('p1', 'Maria Souza')] });
    mocks.createPatient.mockResolvedValue({
      success: true,
      data: patient('p5', 'Ana Lima'),
      error: null,
    });
    await renderServerPage(PatientsPage);
    fireEvent.click(await screen.findByText('+ Novo paciente'));
    fireEvent.change(screen.getByLabelText(/Nome completo/), {
      target: { value: 'Ana Lima' },
    });
    fireEvent.change(screen.getByLabelText(/Telefone \*/), {
      target: { value: '11977776666' },
    });
    fireEvent.click(screen.getByText('Salvar'));

    expect(await screen.findByText('Ana Lima')).toBeInTheDocument();
    expect(screen.queryByText('Novo paciente')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Dado a linha de um paciente, Quando renderizada, Então o prontuário é um link de navegação para a ficha', async () => {
    serve({ items: [patient('p1', 'Maria Souza')] });

    await renderServerPage(PatientsPage);

    const link = await screen.findByRole('link', { name: 'Prontuário' });
    expect(link).toHaveAttribute('href', '/pacientes/p1');
  });
});
