// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { AppointmentDetail } from '@/app/(staff)/agenda/appointment-detail';
import DashboardPage from '@/app/(staff)/page';
import type { AppointmentDto, FollowUpDto } from '@/lib/dto';
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

const WA_URL = 'https://wa.me/5511999990000?text=Ol%C3%A1';

const appointment = (status: string): AppointmentDto => ({
  id: 'appt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: '2026-07-19T12:00:00.000Z',
  endsAt: '2026-07-19T13:00:00.000Z',
  procedure: 'Troca de bolsa',
  priceCents: 12000,
  notes: null,
  status,
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
});

const followUp = (id: string, recallExhausted: boolean): FollowUpDto => ({
  id,
  patientId: `pat-${id}`,
  patientName: `Paciente ${id}`,
  appointmentId: null,
  dueDate: '2026-07-10T00:00:00.000Z',
  reason: 'Retorno: avaliação de ferida',
  status: 'pending',
  isOverdue: true,
  recallExhausted,
});

interface MockOptions {
  sent?: Record<string, string>;
  postError?: string;
  followUps?: FollowUpDto[];
}

const json = (
  success: boolean,
  data: unknown,
  error: string | null = null,
) => ({
  ok: success,
  json: async () => ({ success, data, error }),
});

function mockFetch({ sent = {}, postError, followUps = [] }: MockOptions = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/reminders/whatsapp-link') && method === 'GET') {
        return json(true, sent);
      }
      if (url === '/api/reminders/whatsapp-link' && method === 'POST') {
        return postError
          ? json(false, null, postError)
          : json(true, { url: WA_URL, sentAt: '2026-07-16T14:07:00.000Z' });
      }
      if (url.startsWith('/api/summary')) {
        return json(true, {
          billing: { paidCents: 0, pendingCents: 0, pendingCount: 0 },
          appointmentsInMonth: 0,
          today: [],
        });
      }
      if (url.startsWith('/api/follow-ups')) return json(true, followUps);
      if (url.startsWith('/api/supplies')) return json(true, []);
      if (url.startsWith('/api/photos/triage')) return json(true, []);
      throw new Error(`URL não mapeada no mock: ${method} ${url}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const posts = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

const renderDetail = (status: string) =>
  renderWithToast(
    <AppointmentDetail
      appointment={appointment(status)}
      onAction={async () => {}}
      onReschedule={async () => {}}
    />,
  );

let openSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  openSpy = vi.fn();
  vi.stubGlobal('open', openSpy);
  resetHojeData();
  mockHojeData();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Botão Enviar WhatsApp no detalhe da consulta', () => {
  it('C19 botão só aparece para consulta scheduled', () => {
    mockFetch();
    for (const status of ['confirmed', 'completed', 'cancelled', 'no_show']) {
      const { unmount } = renderDetail(status);
      expect(
        screen.queryByRole('button', { name: 'Enviar WhatsApp' }),
      ).not.toBeInTheDocument();
      unmount();
    }

    renderDetail('scheduled');
    expect(
      screen.getByRole('button', { name: 'Enviar WhatsApp' }),
    ).toBeInTheDocument();
  });

  it('C20 clique abre o wa.me em nova aba', async () => {
    const fetchMock = mockFetch();
    renderDetail('scheduled');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    expect(openSpy.mock.calls[0][0]).toBe(WA_URL);
    expect(openSpy.mock.calls[0][1]).toBe('_blank');
    const [post] = posts(fetchMock);
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      kind: 'confirmation',
      referenceId: 'appt-1',
    });
    expect(
      await screen.findByText('enviado hoje às 14:07'),
    ).toBeInTheDocument();
  });

  it('C23 mostra enviado hoje às HH:MM e segue clicável', async () => {
    const fetchMock = mockFetch({
      sent: { 'appt-1': '2026-07-16T09:15:00.000Z' },
    });
    renderDetail('scheduled');

    expect(
      await screen.findByText('enviado hoje às 09:15'),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Enviar WhatsApp' });
    expect(button).toBeEnabled();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('kind=confirmation&referenceIds=appt-1'),
      ),
    ).toBe(true);

    fireEvent.click(button);
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    // Continua mostrando o primeiro clique do dia.
    expect(screen.getByText('enviado hoje às 09:15')).toBeInTheDocument();
  });

  it('C31 falha do POST mostra toast danger e não abre o link', async () => {
    mockFetch({ postError: 'Consulta não encontrado(a)' });
    renderDetail('scheduled');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp' }));

    const message = await screen.findByText('Consulta não encontrado(a)');
    expect(
      message.closest('[data-variant]')?.getAttribute('data-variant'),
    ).toBe('danger');
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/enviado hoje/)).not.toBeInTheDocument();
  });
});

describe('Feature: Botão Enviar WhatsApp e selo nos retornos pendentes', () => {
  const rows = () =>
    screen
      .getAllByText(/^Paciente fu-/)
      .map((link) => link.closest('[data-follow-up-row]') as HTMLElement);

  it('C22 cada retorno pendente tem o botão', async () => {
    mockHojeData({
      followUps: [followUp('fu-1', false), followUp('fu-2', false)],
      sent: { 'fu-2': '2026-07-16T10:40:00.000Z' },
    });
    const fetchMock = mockFetch();
    await renderServerPage(DashboardPage);

    await screen.findByText('Paciente fu-1');
    const [first, second] = rows();
    expect(
      within(first).getByRole('button', { name: 'Enviar WhatsApp' }),
    ).toBeInTheDocument();
    expect(
      await within(second).findByText('enviado hoje às 10:40'),
    ).toBeInTheDocument();

    fireEvent.click(
      within(first).getByRole('button', { name: 'Enviar WhatsApp' }),
    );
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        WA_URL,
        '_blank',
        'noopener,noreferrer',
      ),
    );
    expect(JSON.parse(String(posts(fetchMock)[0][1]?.body))).toEqual({
      kind: 'recall',
      referenceId: 'fu-1',
    });
  });

  it('C32 selo aparece só no retorno esgotado', async () => {
    mockHojeData({
      followUps: [followUp('fu-1', true), followUp('fu-2', false)],
    });
    await renderServerPage(DashboardPage);

    await screen.findByText('Paciente fu-1');
    const [exhausted, active] = rows();
    expect(
      within(exhausted).getByText('3 lembretes sem resposta'),
    ).toBeInTheDocument();
    expect(
      within(active).queryByText('3 lembretes sem resposta'),
    ).not.toBeInTheDocument();
  });
});
