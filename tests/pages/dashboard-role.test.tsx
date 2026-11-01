// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(staff)/page';
import type { UserRole } from '@/domain/auth/user-role';
import { hoje, mockHojeData, resetHojeData } from '../support/hoje-data';
import { renderServerPage } from '../support/server-page';

vi.mock('next/navigation', async () => {
  const { hoje } = await import('../support/hoje-data');
  return {
    useRouter: () => ({ refresh: hoje.refresh, push: vi.fn() }),
    usePathname: () => '/',
  };
});
vi.mock('@/lib/server/session', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { requireStaffPage: hoje.requireStaffPage };
});
vi.mock('@/lib/server/data/appointments', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listAppointmentsFor: hoje.listAppointmentsFor };
});
vi.mock('@/lib/server/data/month-summary', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { buildMonthSummary: hoje.buildMonthSummary };
});
vi.mock('@/lib/server/data/follow-ups', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listFollowUpsFor: hoje.listFollowUpsFor };
});
vi.mock('@/lib/server/data/reminders', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { whatsappSentToday: hoje.whatsappSentToday };
});
vi.mock('@/lib/server/data/supplies', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listSuppliesFor: hoje.listSuppliesFor };
});
vi.mock('@/lib/server/data/triage', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { buildLinkedTriageQueue: hoje.buildLinkedTriageQueue };
});
vi.mock('@/lib/server/data/majority', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listMajorityReviewsFor: hoje.listMajorityReviewsFor };
});
vi.mock('@/app/(staff)/hoje-actions', async () => {
  const { hoje } = await import('../support/hoje-data');
  return {
    resolveFollowUp: hoje.resolveFollowUp,
    decideTriage: hoje.decideTriage,
    keepMajorityGuardian: hoje.keepMajorityGuardian,
  };
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
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
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

const renderPage = () => renderServerPage(DashboardPage);

beforeEach(() => {
  resetHojeData();
});

/** Leituras como o servidor as entrega ao papel: o resumo, o estoque e a triagem nem são pedidos. */
function mockForRole(
  role: UserRole,
  data: Parameters<typeof mockHojeData>[0] = {},
) {
  mockHojeData({
    role,
    today: [todayAppointment],
    followUps: [followUp],
    ...data,
  });
}

/** Issue #199: a home do Atendente/Profissional era só um alerta de 403. */
describe('Feature: dashboard por papel (#199)', () => {
  afterEach(() => {
    cleanup();
  });

  it('C38 atendente vê consultas do dia e retornos sem alerta', async () => {
    mockForRole('atendente');

    await renderPage();

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
    expect(hoje.buildMonthSummary).not.toHaveBeenCalled();
    expect(hoje.listSuppliesFor).not.toHaveBeenCalled();
    expect(hoje.buildLinkedTriageQueue).not.toHaveBeenCalled();
    expect(hoje.listMajorityReviewsFor).toHaveBeenCalled();
  });

  it('profissional vê a agenda do dia (sem resumo) e a fila de triagem', async () => {
    mockForRole('profissional', { followUps: [] });

    await renderPage();

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    await waitFor(() => expect(hoje.buildLinkedTriageQueue).toHaveBeenCalled());
    expect(hoje.listAppointmentsFor).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'profissional' }),
      expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
    );
    expect(hoje.buildMonthSummary).not.toHaveBeenCalled();
    expect(hoje.listSuppliesFor).not.toHaveBeenCalled();
    expect(hoje.listMajorityReviewsFor).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

/** Tela "Hoje" (#428): o próximo atendimento e os números do dia ficam no topo da agenda. */
describe('Feature: tela Hoje (#428)', () => {
  afterEach(() => {
    cleanup();
  });

  it('Dado uma consulta aberta hoje, Então destaca o próximo atendimento e a contagem do dia', async () => {
    mockForRole('atendente');

    await renderPage();

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
  });

  it('Dado paciente com 4 nomes, Quando abrir Hoje, Então a lista abrevia e o próximo atendimento mostra o nome completo', async () => {
    mockForRole('atendente', {
      today: [{ ...todayAppointment, patientName: 'Mateus Paulo Costa Silva' }],
      followUps: [],
    });

    await renderPage();

    expect(await screen.findByText('Mateus P. C. Silva')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: /^Mateus Paulo Costa Silva · \d{2}:\d{2}$/,
      }),
    ).toBeInTheDocument();
  });
});
