// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(staff)/page';
import { mockHojeData, resetHojeData } from '../support/hoje-data';
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

const followUp = (n: number) => ({
  id: `fu-${n}`,
  patientId: `pat-${n}`,
  patientName: `Paciente ${n}`,
  appointmentId: null,
  dueDate: '2026-07-20T00:00:00.000Z',
  reason: `Retorno ${n}`,
  status: 'pending',
  isOverdue: false,
});

const cinco = [1, 2, 3, 4, 5].map(followUp);

beforeEach(() => {
  resetHojeData();
});

afterEach(() => {
  cleanup();
});

describe('Feature: card de retornos com altura previsível na Hoje (#548)', () => {
  it('Dado 5 retornos pendentes, Quando abre a Hoje, Então mostra 3 e o atalho «Ver todos (5)»', async () => {
    mockHojeData({ role: 'atendente', followUps: cinco });

    await renderServerPage(DashboardPage);

    expect(await screen.findByText('Paciente 3')).toBeInTheDocument();
    expect(screen.queryByText('Paciente 4')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todos (5)' })).toHaveAttribute(
      'href',
      '/?retornos=todos',
    );
  });

  it('Dado ?retornos=todos, Quando abre a Hoje, Então lista os 5 e oferece «Mostrar menos»', async () => {
    mockHojeData({ role: 'atendente', followUps: cinco });

    await renderServerPage(() =>
      DashboardPage({ searchParams: Promise.resolve({ retornos: 'todos' }) }),
    );

    expect(await screen.findByText('Paciente 5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mostrar menos' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('Dado só 3 retornos, Quando abre a Hoje, Então não há atalho de «Ver todos»', async () => {
    mockHojeData({ role: 'atendente', followUps: cinco.slice(0, 3) });

    await renderServerPage(DashboardPage);

    expect(await screen.findByText('Paciente 3')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver todos/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Mostrar menos' })).toBeNull();
  });
});
