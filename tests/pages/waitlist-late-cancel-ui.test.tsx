// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickPatient } from '@/../tests/support/patient-picker';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { AppointmentDetail } from '@/app/(staff)/agenda/appointment-detail';
import { WaitlistPanel } from '@/app/(staff)/agenda/waitlist-panel';
import { CancellationPolicyFields } from '@/app/(staff)/configuracoes/cancellation-policy-fields';
import { JoinWaitlist } from '@/app/portal/waitlist';
import type {
  AppointmentDto,
  PatientDto,
  ProfessionalDto,
  WaitlistEntryDto,
} from '@/lib/dto';
import { MyWaitlistHarness } from '../support/portal-harness';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('@/app/portal/actions', async () =>
  (await import('../support/portal-actions')).portalActionsOverFetch(),
);

vi.mock('next/navigation', async () => {
  const { portalRouter } = await import('../support/portal-router');
  return {
    useRouter: () => ({
      ...router,
      refresh: () => {
        router.refresh();
        portalRouter.reload();
      },
    }),
  };
});

interface FakeResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}
interface Call {
  url: string;
  method: string;
  body: string | null;
}
const ok = (data: unknown): FakeResponse => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});
const failure = (error: string): FakeResponse => ({
  ok: false,
  json: async () => ({ success: false, data: null, error }),
});

function mockFetch(
  routes: { method?: string; path: string; respond: () => FakeResponse }[],
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: (init?.body as string) ?? null });
      const route = routes.find(
        (r) => url.startsWith(r.path) && (r.method ?? 'GET') === method,
      );
      if (!route) throw new Error(`URL não mapeada: ${method} ${url}`);
      return route.respond();
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

// Em 1h: dentro de qualquer antecedência ≥ 2h.
const soon = () => new Date(Date.now() + 3_600_000).toISOString();
const appointment = (): AppointmentDto => ({
  id: 'appt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: soon(),
  endsAt: new Date(Date.now() + 7_200_000).toISOString(),
  procedure: 'Curativo',
  priceCents: 10000,
  notes: null,
  status: 'scheduled',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
});
const policy = { noticeHours: 24, lateFeeCents: 5000 };

describe('Feature: Cancelamento e falta pela agenda', () => {
  it('Dado paciente pedindo em cima da hora com taxa, Quando confirmar, Então envia origem, motivo e cobrança', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    renderWithToast(
      <AppointmentDetail
        appointment={appointment()}
        cancellationPolicy={policy}
        onAction={onAction}
        onReschedule={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Cancelar'));
    fireEvent.change(screen.getByLabelText('Quem pediu o cancelamento?'), {
      target: { value: 'patient' },
    });
    expect(
      screen.getByText(/Cancelamento tardio: menos de 24h/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Motivo (opcional)'), {
      target: { value: ' Imprevisto ' },
    });
    expect(screen.getByText(/Cobrar taxa de/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirmar cancelamento'));

    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith('cancel', null, {
        requestedBy: 'patient',
        reason: 'Imprevisto',
        chargeLateFee: true,
      }),
    );
  });

  it('Dado paciente tardio e a equipe desmarca a taxa, Então não cobra', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    renderWithToast(
      <AppointmentDetail
        appointment={appointment()}
        cancellationPolicy={policy}
        onAction={onAction}
        onReschedule={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Cancelar'));
    fireEvent.change(screen.getByLabelText('Quem pediu o cancelamento?'), {
      target: { value: 'patient' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Confirmar cancelamento'));

    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith(
        'cancel',
        null,
        expect.objectContaining({ chargeLateFee: false }),
      ),
    );
  });

  it('Dado cancelamento pela clínica, Quando confirmar, Então nunca pede taxa', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    renderWithToast(
      <AppointmentDetail
        appointment={appointment()}
        cancellationPolicy={policy}
        onAction={onAction}
        onReschedule={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Cancelar'));
    fireEvent.click(screen.getByText('Confirmar cancelamento'));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith('cancel', null, {
        requestedBy: 'clinic',
        reason: null,
        chargeLateFee: false,
      }),
    );
  });

  it('Dado cancelamento pela clínica, Então não oferece taxa nem marca tardio', () => {
    renderWithToast(
      <AppointmentDetail
        appointment={appointment()}
        cancellationPolicy={policy}
        onAction={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText(/Cobrar taxa/)).toBeNull();
    expect(screen.queryByText(/Cancelamento tardio/)).toBeNull();
    // Clicar de novo fecha o painel.
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText('Confirmar cancelamento')).toBeNull();
  });

  it('Dado clínica com taxa, Quando registrar falta, Então pergunta pela taxa antes', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    renderWithToast(
      <AppointmentDetail
        appointment={appointment()}
        cancellationPolicy={policy}
        onAction={onAction}
        onReschedule={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Registrar falta'));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirmar falta'));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith('no_show', null, {
        chargeLateFee: true,
      }),
    );
  });

  it('Dado clínica sem taxa, Quando registrar falta, Então registra direto', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    renderWithToast(
      <AppointmentDetail
        appointment={appointment()}
        onAction={onAction}
        onReschedule={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Registrar falta'));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('no_show', null));
  });

  it('Dado cancelamento tardio registrado, Então o detalhe mostra "Cancelamento tardio"', () => {
    renderWithToast(
      <AppointmentDetail
        appointment={{
          ...appointment(),
          status: 'cancelled',
          cancelledBy: 'patient',
          cancelledAt: new Date().toISOString(),
          cancelledLate: true,
        }}
        onAction={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );
    expect(screen.getByText(/Cancelamento tardio/)).toBeInTheDocument();
  });
});

describe('Feature: Política de cancelamento (campos)', () => {
  it('Dado política, Quando mudar antecedência e taxa em reais, Então devolve horas e centavos', () => {
    const onChange = vi.fn();
    render(
      <CancellationPolicyFields
        value={{ noticeHours: 24, lateFeeCents: 5000 }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('Taxa tardia/falta (R$)')).toHaveValue(50);
    fireEvent.change(screen.getByLabelText('Antecedência mínima (h)'), {
      target: { value: '48' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      noticeHours: 48,
      lateFeeCents: 5000,
    });
    fireEvent.change(screen.getByLabelText('Taxa tardia/falta (R$)'), {
      target: { value: '35.9' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      noticeHours: 24,
      lateFeeCents: 3590,
    });
  });

  it('Dado grade sem política salva, Então mostra o padrão (24h, sem taxa)', () => {
    render(<CancellationPolicyFields value={undefined} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Antecedência mínima (h)')).toHaveValue(24);
    expect(screen.getByLabelText('Taxa tardia/falta (R$)')).toHaveValue(0);
  });
});

const entry: WaitlistEntryDto = {
  id: 'w-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  procedureId: 'proc-1',
  procedureName: 'Curativo',
  professionalId: 'prof-1',
  fromDate: '2099-07-01',
  toDate: '2099-07-15',
  notes: 'Só de manhã',
  source: 'patient',
  status: 'waiting',
  createdAt: '2099-06-01T12:00:00.000Z',
};
const patients = [
  { id: 'pat-1', fullName: 'Maria Souza', active: true },
] as PatientDto[];
const professionals = [
  { id: 'prof-1', fullName: 'Dra. Ana', active: true },
] as ProfessionalDto[];

describe('Feature: Lista de espera na agenda', () => {
  it('Dado fila, Quando renderizar, Então mostra paciente, origem, procedimento, profissional, período e observação; Agendar repassa a entrada', async () => {
    const onSchedule = vi.fn();
    renderWithToast(
      <WaitlistPanel
        professionals={professionals}
        entries={[entry]}
        error={null}
        onSchedule={onSchedule}
      />,
    );

    expect(await screen.findByText('Lista de espera (1)')).toBeInTheDocument();
    expect(screen.getByText('(pelo portal)')).toBeInTheDocument();
    expect(
      screen.getByText(/Curativo · Dra. Ana · 01\/07\/2099 a 15\/07\/2099/),
    ).toBeInTheDocument();
    expect(screen.getByText('Só de manhã')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));
    expect(onSchedule).toHaveBeenCalledWith(entry);
  });

  it('Dado fila vazia, Então mostra estado vazio', async () => {
    renderWithToast(
      <WaitlistPanel
        professionals={professionals}
        entries={[]}
        error={null}
        onSchedule={vi.fn()}
      />,
    );
    expect(
      await screen.findByText('Ninguém aguardando vaga.'),
    ).toBeInTheDocument();
  });

  it('Dado entrada, Quando remover e confirmar, Então envia a desistência', async () => {
    const calls = mockFetch([
      {
        method: 'PATCH',
        path: '/api/waitlist/w-1',
        respond: () => ok({ ...entry, status: 'removed' }),
      },
    ]);
    renderWithToast(
      <WaitlistPanel
        professionals={professionals}
        entries={[entry]}
        error={null}
        onSchedule={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Remover',
      }),
    );
    expect(
      await screen.findByText('Removido da lista de espera'),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toBe(
      JSON.stringify({ resolution: 'removed' }),
    );
    // A fila vem do servidor: depois de gravar, a tela pede a leitura de novo.
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('Dado falha ao remover, Então avisa por toast', async () => {
    mockFetch([
      {
        method: 'PATCH',
        path: '/api/waitlist/w-1',
        respond: () => failure('Esta entrada já saiu da lista de espera'),
      },
    ]);
    renderWithToast(
      <WaitlistPanel
        professionals={professionals}
        entries={[entry]}
        error={null}
        onSchedule={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Remover',
      }),
    );
    expect(
      await screen.findByText('Esta entrada já saiu da lista de espera'),
    ).toBeInTheDocument();
  });

  it('Dado formulário, Quando adicionar, Então envia o pedido e fecha; erro da API aparece no formulário', async () => {
    let fail = true;
    const calls = mockFetch([
      {
        method: 'POST',
        path: '/api/waitlist',
        respond: () =>
          fail ? failure('O período desejado já passou') : ok(entry),
      },
      {
        path: '/api/options/procedures',
        respond: () => ok([{ id: 'proc-1', name: 'Curativo', active: true }]),
      },
      { path: '/api/patients', respond: () => ok(patients) },
    ]);
    renderWithToast(
      <WaitlistPanel
        professionals={professionals}
        entries={[]}
        error={null}
        onSchedule={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '+ Adicionar' }));
    const dialog = await screen.findByRole('dialog');
    await pickPatient('Maria Souza', 'Paciente *');
    await within(dialog).findByRole('option', { name: 'Curativo' });
    fireEvent.change(within(dialog).getByLabelText('Procedimento'), {
      target: { value: 'proc-1' },
    });
    fireEvent.change(within(dialog).getByLabelText('Profissional'), {
      target: { value: 'prof-1' },
    });
    fireEvent.change(within(dialog).getByLabelText('Aceita a partir de *'), {
      target: { value: '2099-07-01' },
    });
    fireEvent.change(within(dialog).getByLabelText('Até *'), {
      target: { value: '2099-07-15' },
    });
    fireEvent.change(within(dialog).getByLabelText('Observação'), {
      target: { value: ' Só de manhã ' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Adicionar à lista' }),
    );
    expect(
      await within(dialog).findByText('O período desejado já passou'),
    ).toBeInTheDocument();

    fail = false;
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Adicionar à lista' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(calls.filter((c) => c.method === 'POST')[1].body ?? '{}'),
    ).toEqual({
      patientId: 'pat-1',
      procedureId: 'proc-1',
      professionalId: 'prof-1',
      fromDate: '2099-07-01',
      toDate: '2099-07-15',
      notes: 'Só de manhã',
    });
  });
});

describe('Feature: Lista de espera no portal', () => {
  it('Dado dia sem horário, Quando entrar na lista, Então pede 30 dias a partir do dia e confirma', async () => {
    const calls = mockFetch([
      {
        method: 'POST',
        path: '/api/portal/patient/waitlist',
        respond: () => ok(entry),
      },
    ]);
    const onJoined = vi.fn();
    renderWithToast(
      <JoinWaitlist
        procedureId="proc-1"
        fromDate="2099-12-20"
        onJoined={onJoined}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Entrar na lista de espera/ }),
    );

    expect(
      await screen.findByText(/Você está na lista de espera/),
    ).toBeInTheDocument();
    expect(onJoined).toHaveBeenCalled();
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({
      procedureId: 'proc-1',
      fromDate: '2099-12-20',
      toDate: '2100-01-18',
    });
  });

  it('Dado erro, Quando entrar na lista, Então mostra a mensagem', async () => {
    mockFetch([
      {
        method: 'POST',
        path: '/api/portal/patient/waitlist',
        respond: () => failure('Escolha um período a partir de hoje'),
      },
    ]);
    renderWithToast(
      <JoinWaitlist procedureId="proc-1" fromDate="2099-12-20" />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Entrar na lista de espera/ }),
    );
    expect(
      await screen.findByText('Escolha um período a partir de hoje'),
    ).toBeInTheDocument();
  });

  it('Dado pedidos na fila, Quando sair, Então chama leave; sem pedidos, a seção não aparece', async () => {
    let entries = [entry];
    const calls = mockFetch([
      {
        method: 'POST',
        path: '/api/portal/patient/waitlist/w-1/leave',
        respond: () => {
          entries = [];
          return ok({ ...entry, status: 'removed' });
        },
      },
      { path: '/api/portal/patient/waitlist', respond: () => ok(entries) },
    ]);
    renderWithToast(<MyWaitlistHarness />);

    expect(await screen.findByText('Lista de espera')).toBeInTheDocument();
    expect(screen.getByText('01/07/2099 a 15/07/2099')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sair da lista' }));

    await waitFor(() =>
      expect(screen.queryByText('Lista de espera')).toBeNull(),
    );
    expect(calls.some((c) => c.url.endsWith('/leave'))).toBe(true);
  });

  it('Dado falha ao sair, Então avisa por toast', async () => {
    mockFetch([
      {
        method: 'POST',
        path: '/api/portal/patient/waitlist/w-1/leave',
        respond: () => failure('Entrada não encontrada'),
      },
      { path: '/api/portal/patient/waitlist', respond: () => ok([entry]) },
    ]);
    renderWithToast(<MyWaitlistHarness />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sair da lista' }),
    );
    expect(
      await screen.findByText('Entrada não encontrada'),
    ).toBeInTheDocument();
  });
});
