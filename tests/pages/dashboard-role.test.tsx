// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import DashboardPage from '@/app/(staff)/page';
import type { UserRole } from '@/domain/auth/user-role';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});
const forbidden = () => ({
  ok: false,
  status: 403,
  json: async () => ({
    success: false,
    data: null,
    error: 'Seu papel não tem acesso a este recurso',
  }),
});

const todayAppointment = {
  id: 'appt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 3_600_000).toISOString(),
  procedure: 'Troca de bolsa',
  priceCents: 12000,
  notes: null,
  status: 'scheduled',
  professionalId: null,
};

const followUp = {
  id: 'fu-1',
  patientId: 'pat-2',
  patientName: 'João Lima',
  appointmentId: null,
  dueDate: '2026-07-20T00:00:00.000Z',
  reason: 'Retorno: avaliação de ferida',
  status: 'pending',
  isOverdue: false,
};

/** Rotas como a API responde para o papel: administrativas dão 403. */
function mockApi(role: UserRole) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/auth/identity')) return ok(identityFor(role));
    if (url.startsWith('/api/summary')) return forbidden();
    if (url.startsWith('/api/supplies')) return forbidden();
    if (url.startsWith('/api/photos/triage')) return forbidden();
    if (url.startsWith('/api/appointments')) return ok([todayAppointment]);
    if (url.startsWith('/api/follow-ups')) return ok([followUp]);
    if (url.startsWith('/api/reminders/whatsapp-link')) return ok({});
    // Aviso de maioridade (#372): só Admin e Atendente pedem.
    if (url.startsWith('/api/guardians/majority')) return ok([]);
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Issue #199: a home do Atendente/Profissional era só um alerta de 403. */
describe('Feature: dashboard por papel (#199)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('C38 atendente vê consultas do dia e retornos sem alerta', async () => {
    const fetchMock = mockApi('atendente');

    renderWithToast(
      <WithStaffIdentity>
        <DashboardPage />
      </WithStaffIdentity>,
    );

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(await screen.findByText('João Lima')).toBeInTheDocument();
    expect(screen.getByText('Consultas de hoje')).toBeInTheDocument();
    expect(screen.getByText('Retornos pendentes')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Seu papel não tem acesso a este recurso'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Recebido no mês')).not.toBeInTheDocument();
    expect(screen.queryByText('Estoque baixo')).not.toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.startsWith('/api/summary'))).toBe(false);
    expect(urls.some((u) => u.startsWith('/api/supplies'))).toBe(false);
    expect(urls.some((u) => u.startsWith('/api/photos/triage'))).toBe(false);
    expect(urls.some((u) => u.startsWith('/api/guardians/majority'))).toBe(
      true,
    );
  });

  it('profissional vê a agenda do dia (sem resumo) e a fila de triagem', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/auth/identity')) {
        return ok(identityFor('profissional'));
      }
      if (url.startsWith('/api/photos/triage')) return ok([]);
      if (url.startsWith('/api/appointments')) return ok([todayAppointment]);
      if (url.startsWith('/api/follow-ups')) return ok([]);
      if (url.startsWith('/api/summary')) return forbidden();
      if (url.startsWith('/api/supplies')) return forbidden();
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithToast(
      <WithStaffIdentity>
        <DashboardPage />
      </WithStaffIdentity>,
    );

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) =>
          String(u).startsWith('/api/photos/triage'),
        ),
      ).toBe(true),
    );
    const appointmentsCall = fetchMock.mock.calls
      .map(([u]) => String(u))
      .find((u) => u.startsWith('/api/appointments'));
    expect(appointmentsCall).toMatch(/from=.*&to=/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

/** Tela "Hoje" (#428): o próximo atendimento e os números do dia ficam no topo da agenda. */
describe('Feature: tela Hoje (#428)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Dado uma consulta aberta hoje, Então destaca o próximo atendimento e a contagem do dia', async () => {
    mockApi('atendente');

    renderWithToast(
      <WithStaffIdentity>
        <DashboardPage />
      </WithStaffIdentity>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hoje' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Próximo atendimento')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /^Maria Souza · \d{2}:\d{2}$/ }),
    ).toHaveAttribute('href', '/pacientes/pat-1');
    expect(
      screen.getByText('Procedimento: Troca de bolsa'),
    ).toBeInTheDocument();
    expect(screen.getByText('0 de 1 concluídas')).toBeInTheDocument();
  });
});

/** Nome do paciente (CONTEXT.md): completo onde identifica, abreviado nas listas. */
describe('Feature: nome do paciente na tela Hoje (#429)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Dado paciente com 4 nomes, Quando abrir Hoje, Então a lista abrevia e o próximo atendimento mostra o nome completo', async () => {
    const appointment = {
      ...todayAppointment,
      patientName: 'Mateus Paulo Costa Silva',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/auth/identity')) {
          return ok(identityFor('atendente'));
        }
        if (url.startsWith('/api/appointments')) return ok([appointment]);
        if (url.startsWith('/api/follow-ups')) return ok([]);
        if (url.startsWith('/api/guardians/majority')) return ok([]);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderWithToast(
      <WithStaffIdentity>
        <DashboardPage />
      </WithStaffIdentity>,
    );

    expect(await screen.findByText('Mateus P. C. Silva')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: /^Mateus Paulo Costa Silva · \d{2}:\d{2}$/,
      }),
    ).toBeInTheDocument();
  });
});
