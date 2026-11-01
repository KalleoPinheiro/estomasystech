// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AttendanceDocumentPage from '@/app/documentos/atestado/[appointmentId]/page';
import ConsentDocumentPage from '@/app/documentos/consentimento/[patientId]/page';
import CarePlanDocumentPage from '@/app/documentos/plano-cuidados/[carePlanId]/page';
import PartnerReportPage from '@/app/documentos/relatorio/[conditionId]/page';
import { renderDocumentPage } from '../support/documentos-over-fetch';

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

const jsonResponse = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

const CLINIC_INCOMPLETE = {
  name: 'Clínica EstomaSysTech',
  cnpj: null,
  address: null,
  city: null,
  professionalName: null,
  professionalRegistry: null,
};

const CLINIC_COMPLETE = {
  ...CLINIC_INCOMPLETE,
  cnpj: '12.345.678/0001-95',
  professionalName: 'Enf. Ana',
  professionalRegistry: 'COREN-SP 123456',
};

const appointment = (status: string) => ({
  id: 'apt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: '2026-09-01T13:00:00.000Z',
  endsAt: '2026-09-01T13:30:00.000Z',
  procedure: 'Troca de bolsa',
  priceCents: 10000,
  status,
});

/** Responde ao que a página pede e devolve a lista de chamadas para `/api/documents/issue`. */
function mockFetch(clinic: unknown, appointmentStatus = 'completed') {
  const issued: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/api/documents/issue')) {
        issued.push(url);
        return jsonResponse({
          documentNumber: 'TEST-00000001',
          issuedAt: '2026-09-01T10:00:00.000Z',
        });
      }
      if (url.includes('/api/clinic-info')) return jsonResponse(clinic);
      if (url.includes('/api/appointments/'))
        return jsonResponse(appointment(appointmentStatus));
      return jsonResponse(null);
    }),
  );
  return issued;
}

async function renderPage(ui: ReactElement) {
  await act(async () => {
    await renderDocumentPage(ui);
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** #468: a trilha de auditoria só registra emissão de documento que foi de fato emitido. */
describe('Feature: página de documento bloqueada não emite nem audita (#468)', () => {
  it('Dada clínica sem responsável técnico, Quando abrir o atestado, Então avisa e não chama a emissão', async () => {
    const issued = mockFetch(CLINIC_INCOMPLETE);

    await renderPage(
      <AttendanceDocumentPage
        params={Promise.resolve({ appointmentId: 'apt-1' })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/sem CNPJ ou responsável técnico/i),
      ).toBeInTheDocument(),
    );
    expect(issued).toEqual([]);
  });

  it('Dada consulta que não foi realizada, Quando abrir o atestado, Então avisa e não chama a emissão', async () => {
    const issued = mockFetch(CLINIC_COMPLETE, 'scheduled');

    await renderPage(
      <AttendanceDocumentPage
        params={Promise.resolve({ appointmentId: 'apt-1' })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/não é possível emitir declaração/i),
      ).toBeInTheDocument(),
    );
    expect(issued).toEqual([]);
  });

  it('Dada clínica completa e consulta realizada, Quando abrir o atestado, Então emite uma vez', async () => {
    const issued = mockFetch(CLINIC_COMPLETE);

    await renderPage(
      <AttendanceDocumentPage
        params={Promise.resolve({ appointmentId: 'apt-1' })}
      />,
    );

    await waitFor(() => expect(issued).toHaveLength(1));
  });

  it.each([
    [
      'termo de consentimento',
      <ConsentDocumentPage
        key="c"
        params={Promise.resolve({ patientId: 'pat-1' })}
      />,
    ],
    [
      'relatório para o parceiro',
      <PartnerReportPage
        key="r"
        params={Promise.resolve({ conditionId: 'cond-1' })}
      />,
    ],
    [
      'plano de cuidados',
      <CarePlanDocumentPage
        key="p"
        params={Promise.resolve({ carePlanId: 'plan-1' })}
      />,
    ],
  ])(
    'Dada clínica incompleta, Quando abrir o %s, Então não chama a emissão',
    async (_name, page) => {
      const issued = mockFetch(CLINIC_INCOMPLETE);

      await renderPage(page);
      // Deixa as consultas da página responderem antes de conferir.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(issued).toEqual([]);
    },
  );
});
