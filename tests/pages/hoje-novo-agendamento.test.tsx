// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEW_APPOINTMENT_HREF } from '@/app/(staff)/agenda/agenda-range';
import DashboardPage from '@/app/(staff)/page';
import type { UserRole } from '@/domain/auth/user-role';
import { mockHojeData, resetHojeData } from '../support/hoje-data';
import { renderServerPage } from '../support/server-page';

const push = vi.fn();

vi.mock('next/navigation', async () => {
  const { hoje } = await import('../support/hoje-data');
  return {
    useRouter: () => ({ refresh: hoje.refresh, push }),
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

beforeEach(() => {
  resetHojeData();
  push.mockClear();
});
afterEach(cleanup);

describe('Feature: Novo agendamento na tela Hoje (#973)', () => {
  it.each<UserRole>(['company_admin', 'atendente', 'profissional'])(
    'Dado o papel %s, que agenda, Quando clicar em Novo agendamento, Então abre a nova consulta na agenda',
    async (role) => {
      mockHojeData({ role, today: [], followUps: [] });

      await renderServerPage(DashboardPage);

      const button = await screen.findByRole('button', {
        name: '+ Novo agendamento',
      });
      fireEvent.click(button);
      expect(push).toHaveBeenCalledWith(NEW_APPOINTMENT_HREF);
      expect(NEW_APPOINTMENT_HREF).toBe('/agenda?nova=1');
    },
  );

  it('Dado um papel sem acesso à agenda, Então o botão não aparece', async () => {
    mockHojeData({ role: 'super_admin', today: [], followUps: [] });

    await renderServerPage(DashboardPage);

    await screen.findByText('Hoje');
    expect(
      screen.queryByRole('button', { name: '+ Novo agendamento' }),
    ).not.toBeInTheDocument();
  });
});
