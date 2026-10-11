// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import AgendaPage from '@/app/(staff)/agenda/page';
import type { AppointmentDto, WaitlistEntryDto } from '@/lib/dto';

interface Call {
  url: string;
  method: string;
  body: string | null;
}
const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});
const failure = (error: string) => ({
  ok: false,
  json: async () => ({ success: false, data: null, error }),
});

const appointment: AppointmentDto = {
  id: 'appt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 3_600_000).toISOString(),
  procedure: 'Curativo',
  priceCents: 10000,
  notes: null,
  status: 'scheduled',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
};

const entry: WaitlistEntryDto = {
  id: 'w-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  procedureId: 'proc-1',
  procedureName: 'Curativo',
  professionalId: null,
  fromDate: '2000-01-01',
  toDate: '2099-12-31',
  notes: null,
  source: 'staff',
  status: 'waiting',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function mockAgenda(
  options: { waitlistPatchFails?: boolean; catalogFails?: boolean } = {},
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: (init?.body as string) ?? null });
      if (url.startsWith('/api/waitlist/') && method === 'PATCH') {
        return options.waitlistPatchFails
          ? failure('Falha')
          : ok({ ...entry, status: 'scheduled' });
      }
      if (url.startsWith('/api/waitlist')) return ok([entry]);
      if (url === '/api/appointments/appt-1' && method === 'PATCH') {
        return ok({
          ...appointment,
          status: 'cancelled',
          feeInvoiceId: 'inv-1',
          waitlistMatches: 2,
        });
      }
      if (url.startsWith('/api/appointments') && method === 'POST') {
        return ok(appointment);
      }
      if (url.startsWith('/api/appointments')) return ok([appointment]);
      if (url === '/api/patients/pat-1') {
        return ok({ id: 'pat-1', fullName: 'Maria Souza', active: true });
      }
      if (url.startsWith('/api/patients')) {
        return ok([{ id: 'pat-1', fullName: 'Maria Souza', active: true }]);
      }
      if (url.startsWith('/api/options/professionals')) return ok([]);
      if (url.startsWith('/api/options/procedures')) {
        return options.catalogFails ? failure('Acesso negado') : ok([]);
      }
      if (url.startsWith('/api/settings/schedule/closures')) return ok([]);
      if (url.startsWith('/api/schedule-config')) {
        return ok({
          config: {
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            startHour: 0,
            endHour: 24,
            minGapMinutes: 15,
            cancellationPolicy: { noticeHours: 24, lateFeeCents: 5000 },
          },
          isDefault: false,
        });
      }
      throw new Error(`URL não mapeada: ${method} ${url}`);
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Agenda com lista de espera e cancelamento tardio', () => {
  it('Dado o catálogo indisponível, Então a lista de espera mostra o erro', async () => {
    mockAgenda({ catalogFails: true });
    renderWithToast(<AgendaPage />);

    fireEvent.click(await screen.findByRole('button', { name: '+ Adicionar' }));

    expect(
      await screen.findByText(
        'Não foi possível carregar o catálogo de procedimentos: Acesso negado',
      ),
    ).toBeInTheDocument();
  });

  it('Dado paciente na fila, Quando agendar a partir dela, Então o formulário vem preenchido e a entrada sai da fila', async () => {
    const calls = mockAgenda();
    renderWithToast(<AgendaPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Agendar' }));
    expect(await screen.findByText('Nova consulta')).toBeInTheDocument();
    // Paciente da fila já selecionado no PatientPicker (#197).
    await waitFor(() =>
      expect(
        document.querySelector('[data-patient-picker-selected]'),
      ).toHaveTextContent('Maria Souza'),
    );
    expect(screen.getByLabelText(/Procedimento \*/)).toHaveValue('Curativo');
    fireEvent.change(screen.getByLabelText(/Valor/), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByText('Agendar consulta'));

    await waitFor(() =>
      expect(
        calls.find((c) => c.url === '/api/waitlist/w-1' && c.method === 'PATCH')
          ?.body,
      ).toBe(JSON.stringify({ resolution: 'scheduled' })),
    );
    expect(await screen.findByText('Consulta criada')).toBeInTheDocument();
  });

  it('Dado falha ao tirar da fila, Quando a consulta é criada, Então avisa que a entrada continua na lista', async () => {
    mockAgenda({ waitlistPatchFails: true });
    renderWithToast(<AgendaPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Agendar' }));
    fireEvent.change(await screen.findByLabelText(/Valor/), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByText('Agendar consulta'));

    expect(
      await screen.findByText(/não foi possível tirar o paciente da lista/),
    ).toBeInTheDocument();
  });

  it('Dado cancelamento tardio com taxa e fila para o dia, Quando cancelar, Então avisa a taxa lançada e quantos aguardam', async () => {
    const calls = mockAgenda();
    renderWithToast(<AgendaPage />);

    fireEvent.click(await screen.findByTitle(/Maria Souza — Curativo/));
    fireEvent.click(await screen.findByText('Cancelar'));
    fireEvent.change(screen.getByLabelText('Quem pediu o cancelamento?'), {
      target: { value: 'patient' },
    });
    fireEvent.click(screen.getByText('Confirmar cancelamento'));

    expect(
      await screen.findByText(/Taxa lançada como fatura pendente/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2 na lista de espera aceitam esse dia/),
    ).toBeInTheDocument();
    expect(
      JSON.parse(
        calls.find((c) => c.url === '/api/appointments/appt-1')?.body ?? '{}',
      ),
    ).toMatchObject({
      action: 'cancel',
      requestedBy: 'patient',
      chargeLateFee: true,
    });
  });
});
