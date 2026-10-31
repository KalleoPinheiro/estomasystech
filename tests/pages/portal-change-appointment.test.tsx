// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { ChangeAppointment } from '@/app/portal/change-appointment';
import type { PortalAppointmentDto } from '@/lib/dto';
import { formatTime } from '@/lib/format';

import { PatientPortalHarness } from '../support/portal-harness';

vi.mock('next/navigation', async () =>
  (await import('../support/portal-router')).navigationMock(),
);

interface Call {
  url: string;
  method: string;
  body: string | null;
}

interface FakeResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

const ok = (data: unknown): FakeResponse => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});
const failure = (error: string): FakeResponse => ({
  ok: false,
  json: async () => ({ success: false, data: null, error }),
});

/** Roteador de fetch por prefixo de URL + método, registrando as chamadas. */
function mockFetch(
  routes: {
    method?: string;
    path: string;
    respond: () => FakeResponse;
  }[],
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: (init?.body as string) ?? null });
      // Lista de espera do paciente: vazia, salvo quando o cenário define
      // uma rota própria para ela (o prefixo '/api/portal/patient' não vale).
      const isWaitlist = url.startsWith('/api/portal/patient/waitlist');
      const route =
        routes.find(
          (r) =>
            url.startsWith(r.path) &&
            (r.method ?? 'GET') === method &&
            (!isWaitlist || r.path.includes('/waitlist')),
        ) ?? (isWaitlist ? { respond: () => ok([]) } : undefined);
      if (!route) throw new Error(`URL não mapeada: ${method} ${url}`);
      return route.respond();
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const appointment: PortalAppointmentDto = {
  id: 'appt-1',
  startsAt: '2099-01-10T12:00:00.000Z',
  endsAt: '2099-01-10T13:00:00.000Z',
  procedure: 'Curativo',
  status: 'scheduled',
  cancelledBy: null,
};
const farFromIt = new Date('2099-01-01T00:00:00.000Z').getTime();

describe('Feature: Paciente cancela ou remarca pelo portal (tela)', () => {
  it('Dado menos de 24h para a consulta, Quando renderizar, Então não oferece as ações e orienta a falar com a clínica', () => {
    mockFetch([]);
    renderWithToast(
      <ChangeAppointment
        appointment={appointment}
        nowMs={new Date('2099-01-09T12:00:01.000Z').getTime()}
        onChanged={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Remarcar' })).toBeNull();
    expect(screen.getByText(/fale com a clínica/)).toBeInTheDocument();
  });

  it('Dado prazo ok, Quando cancelar com motivo, Então envia o motivo e avisa a tela', async () => {
    const calls = mockFetch([
      {
        method: 'POST',
        path: '/api/portal/patient/appointments/appt-1/cancel',
        respond: () => ok({ ...appointment, status: 'cancelled' }),
      },
    ]);
    const onChanged = vi.fn();
    renderWithToast(
      <ChangeAppointment
        appointment={appointment}
        nowMs={farFromIt}
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar consulta' }));
    fireEvent.change(screen.getByLabelText(/Motivo/), {
      target: { value: 'Imprevisto' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar cancelamento' }),
    );

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls.at(-1)?.body).toBe(JSON.stringify({ reason: 'Imprevisto' }));
    expect(await screen.findByText('Consulta cancelada')).toBeInTheDocument();
  });

  it('Dado motivo em branco, Quando cancelar, Então envia motivo nulo', async () => {
    const calls = mockFetch([
      {
        method: 'POST',
        path: '/api/portal/patient/appointments/appt-1/cancel',
        respond: () => ok(appointment),
      },
    ]);
    renderWithToast(
      <ChangeAppointment
        appointment={appointment}
        nowMs={farFromIt}
        onChanged={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar consulta' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar cancelamento' }),
    );

    await waitFor(() =>
      expect(calls.at(-1)?.body).toBe(JSON.stringify({ reason: null })),
    );
  });

  it('Dado erro da API ao cancelar, Quando cancelar, Então mostra a mensagem e mantém o painel', async () => {
    mockFetch([
      {
        method: 'POST',
        path: '/api/portal/patient/appointments/appt-1/cancel',
        respond: () => failure('Faltam menos de 24 horas'),
      },
    ]);
    const onChanged = vi.fn();
    renderWithToast(
      <ChangeAppointment
        appointment={appointment}
        nowMs={farFromIt}
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar consulta' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar cancelamento' }),
    );

    expect(
      await screen.findByText('Faltam menos de 24 horas'),
    ).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Confirmar cancelamento' }),
    ).toBeEnabled();
  });

  it('Dado prazo ok, Quando remarcar, Então lista horários pela própria consulta e envia o novo início após confirmar', async () => {
    const newSlot = {
      startsAt: '2099-01-12T15:00:00.000Z',
      endsAt: '2099-01-12T16:00:00.000Z',
    };
    const calls = mockFetch([
      {
        path: '/api/portal/patient/slots',
        respond: () => ok([newSlot]),
      },
      {
        method: 'POST',
        path: '/api/portal/patient/appointments/appt-1/reschedule',
        respond: () => ok({ ...appointment, ...newSlot }),
      },
    ]);
    const onChanged = vi.fn();
    renderWithToast(
      <ChangeAppointment
        appointment={appointment}
        nowMs={farFromIt}
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remarcar' }));
    fireEvent.change(screen.getByLabelText(/Novo dia/), {
      target: { value: '2099-01-12' },
    });
    fireEvent.click(await screen.findByText(formatTime(newSlot.startsAt)));
    expect(await screen.findByText('Confirmar remarcação')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(
      calls.some((c) =>
        c.url.startsWith(
          '/api/portal/patient/slots?appointmentId=appt-1&date=2099-01-12',
        ),
      ),
    ).toBe(true);
    expect(calls.at(-1)?.body).toBe(
      JSON.stringify({ startsAt: newSlot.startsAt }),
    );
  });

  it('Dado horário tomado entre a listagem e a remarcação, Quando remarcar, Então mostra o erro', async () => {
    const newSlot = {
      startsAt: '2099-01-12T15:00:00.000Z',
      endsAt: '2099-01-12T16:00:00.000Z',
    };
    mockFetch([
      { path: '/api/portal/patient/slots', respond: () => ok([newSlot]) },
      {
        method: 'POST',
        path: '/api/portal/patient/appointments/appt-1/reschedule',
        respond: () => failure('Horário indisponível'),
      },
    ]);
    renderWithToast(
      <ChangeAppointment
        appointment={appointment}
        nowMs={farFromIt}
        onChanged={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remarcar' }));
    fireEvent.click(await screen.findByText(formatTime(newSlot.startsAt)));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Horário indisponível')).toBeInTheDocument();
  });

  it('Dado consulta futura cancelada pelo próprio paciente, Quando abrir o portal, Então não aparece o alerta de cancelamento pela clínica', async () => {
    mockFetch([
      {
        path: '/api/portal/patient/consent',
        respond: () =>
          ok({ consentText: 'Termo', accepted: true, acceptedAt: null }),
      },
      {
        path: '/api/portal/patient',
        respond: () =>
          ok({
            patient: {
              id: 'pat-1',
              fullName: 'Ana Souza',
              email: 'ana@paciente.com',
              phone: null,
            },
            appointments: [
              { ...appointment, status: 'cancelled', cancelledBy: 'patient' },
            ],
            conditions: [],
            invoices: [],
            followUps: [],
          }),
      },
    ]);

    renderWithToast(<PatientPortalHarness />);

    expect(
      await screen.findByText('Histórico de consultas'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cancelada pela clínica/)).toBeNull();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });

  it('Dado consulta futura ativa, Quando abrir o portal, Então oferece remarcar e cancelar', async () => {
    mockFetch([
      {
        path: '/api/portal/patient/consent',
        respond: () =>
          ok({ consentText: 'Termo', accepted: true, acceptedAt: null }),
      },
      {
        path: '/api/portal/patient',
        respond: () =>
          ok({
            patient: {
              id: 'pat-1',
              fullName: 'Ana Souza',
              email: 'ana@paciente.com',
              phone: null,
            },
            appointments: [appointment],
            conditions: [],
            invoices: [],
            followUps: [],
          }),
      },
    ]);

    renderWithToast(<PatientPortalHarness />);

    expect(
      await screen.findByRole('button', { name: 'Remarcar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancelar consulta' }),
    ).toBeInTheDocument();
  });
});
