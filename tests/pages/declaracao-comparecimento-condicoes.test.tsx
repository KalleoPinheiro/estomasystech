// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppointmentDetail } from '@/app/(staff)/agenda/appointment-detail';
import AttendanceDocumentPage from '@/app/documentos/atestado/[appointmentId]/page';
import type { AppointmentDto } from '@/lib/dto';
import { renderDocumentPage } from '../support/documentos-over-fetch';
import { renderWithToast } from '../support/render-with-toast';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/server/session', async () =>
  (await import('../support/documentos-over-fetch')).sessionOverFetch(),
);
vi.mock('@/lib/server/data/clinic-info', async () =>
  (await import('../support/documentos-over-fetch')).clinicInfoOverFetch(),
);
vi.mock('@/lib/server/data/patient-record', async () =>
  (await import('../support/documentos-over-fetch')).patientRecordOverFetch(),
);
vi.mock('@/lib/server/data/care-plan', async () =>
  (await import('../support/documentos-over-fetch')).carePlanOverFetch(),
);
vi.mock('@/lib/server/data/documents', async () =>
  (await import('../support/documentos-over-fetch')).documentsDataOverFetch(),
);
vi.mock('@/lib/server/document-issuance', async () =>
  (await import('../support/documentos-over-fetch')).noPriorIssuance(),
);
vi.mock('@/app/documentos/actions', async () =>
  (await import('../support/documentos-over-fetch')).documentActionsOverFetch(),
);

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

const appointment = (status: string): AppointmentDto => ({
  id: 'apt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: '2026-09-01T13:00:00.000Z',
  endsAt: '2026-09-01T13:30:00.000Z',
  procedure: 'Troca de bolsa',
  priceCents: 10000,
  notes: null,
  status,
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
});

const COMPLETE = {
  name: 'Clínica',
  cnpj: '12.345.678/0001-95',
  address: null,
  city: null,
  professionalName: 'Enf. Ana',
  professionalRegistry: 'COREN-SP 1',
};

function stub(clinic: unknown, status: string) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/api/documents/issue'))
      return ok({
        documentNumber: 'ATST-1',
        issuedAt: '2026-09-01T10:00:00.000Z',
      });
    if (url.includes('/api/clinic-info')) return ok(clinic);
    if (url.includes('/api/appointments/')) return ok(appointment(status));
    return ok({ id: 'pat-1', fullName: 'Maria Souza', birthDate: null });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderPage() {
  await act(async () => {
    await renderDocumentPage(
      <AttendanceDocumentPage
        params={Promise.resolve({ appointmentId: 'apt-1' })}
      />,
    );
  });
}

const issueCalls = (fetchMock: ReturnType<typeof stub>) =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).includes('/api/documents/issue'),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: declaração de comparecimento só quando pode ser emitida (#468, #474, #485)', () => {
  it('Dado clínica sem responsável técnico, Quando abrir a declaração, Então diz o que falta, linka Configurações e não registra emissão', async () => {
    const fetchMock = stub(
      { ...COMPLETE, professionalName: null },
      'completed',
    );

    await renderPage();

    await waitFor(() =>
      expect(
        screen.getByText(/falta: responsável técnico/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: 'Configurações → Dados cadastrais' }),
    ).toHaveAttribute('href', '/configuracoes#dados');
    expect(
      screen.getByRole('link', { name: 'Voltar ao início' }),
    ).toBeInTheDocument();
    expect(issueCalls(fetchMock)).toHaveLength(0);
  });

  it('Dado consulta não realizada, Quando abrir a declaração, Então bloqueia e não registra emissão', async () => {
    const fetchMock = stub(COMPLETE, 'scheduled');

    await renderPage();

    await waitFor(() =>
      expect(
        screen.getByText(/Não é possível emitir declaração de comparecimento/),
      ).toBeInTheDocument(),
    );
    expect(issueCalls(fetchMock)).toHaveLength(0);
  });

  it('Dado consulta realizada e clínica completa, Quando abrir a declaração, Então emite uma vez', async () => {
    const fetchMock = stub(COMPLETE, 'completed');

    await renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Declaração de Comparecimento' }),
      ).toBeInTheDocument(),
    );
    expect(issueCalls(fetchMock)).toHaveLength(1);
  });
});

describe('Feature: link da declaração na consulta (#474)', () => {
  const link = () =>
    screen.queryByRole('link', { name: 'Declaração de comparecimento' });

  it.each(['scheduled', 'confirmed', 'cancelled', 'no_show'])(
    'Dado consulta %s, Quando abrir o detalhe, Então não oferece a declaração',
    (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ok({})),
      );
      renderWithToast(
        <AppointmentDetail
          appointment={appointment(status)}
          onAction={vi.fn()}
          onReschedule={vi.fn()}
        />,
      );
      expect(link()).not.toBeInTheDocument();
    },
  );

  it('Dado consulta realizada, Quando abrir o detalhe, Então oferece a declaração', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({})),
    );
    renderWithToast(
      <AppointmentDetail
        appointment={appointment('completed')}
        onAction={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );
    expect(link()).toHaveAttribute('href', '/documentos/atestado/apt-1');
  });
});
