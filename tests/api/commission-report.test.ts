import { describe, expect, it } from 'vitest';
import { jsonRequest } from '../support/request';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface ProductionRow {
  professionalId: string | null;
  count: number;
  totalCents: number;
  commissionCents: number | null;
  releasedCommissionCents: number | null;
  pendingCommissionCents: number | null;
}

interface ReportBody {
  revenueByProcedure: Array<{ procedure: string; totalCents: number }>;
  productionByProfessional: ProductionRow[];
}

// Mês exclusivo deste arquivo — o relatório é da clínica inteira.
const MONTH = '2031-03';

const post = async <T>(path: string, body: unknown): Promise<T> => {
  const route = await import(`@/app/api${path}/route`);
  const response = await route.POST(jsonRequest(`/api${path}`, 'POST', body));
  const parsed = (await response.json()) as Envelope<T>;
  expect(parsed.error).toBeNull();
  return parsed.data;
};

const patch = async (path: string, id: string, body: unknown) => {
  const route = await import(`@/app/api${path}/[id]/route`);
  const response = await route.PATCH(
    jsonRequest(`/api${path}/${id}`, 'PATCH', body),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(200);
};

const report = async (): Promise<ReportBody> => {
  const route = await import('@/app/api/reports/route');
  const response = await route.GET(
    jsonRequest(`/api/reports?month=${MONTH}`, 'GET'),
  );
  return ((await response.json()) as Envelope<ReportBody>).data;
};

const completeSession = async (
  patientId: string,
  professionalId: string,
  procedureId: string,
  day: string,
) => {
  const appointment = await post<{ id: string }>('/appointments', {
    patientId,
    professionalId,
    procedureId,
    procedure: 'Curativo pacote',
    priceCents: 15000,
    startsAt: `${MONTH}-${day}T12:00:00.000Z`,
    endsAt: `${MONTH}-${day}T13:00:00.000Z`,
  });
  await patch('/appointments', appointment.id, { action: 'complete' });
};

describe('Feature: Relatório com repasse apurado, liberado e a liberar (banco real)', () => {
  it('Dado pacote vendido e sessões concluídas, Quando a fatura do pacote é paga, Então o repasse passa de "a liberar" para "liberado" e a receita não conta em dobro', async () => {
    const patient = await post<{ id: string }>('/patients', {
      fullName: 'Paciente Repasse',
      email: 'repasse@x.com',
      phone: '11999990000',
    });
    const professional = await post<{ id: string }>('/professionals', {
      fullName: 'Dra. Repasse',
      commissionPct: 40,
    });
    const procedure = await post<{ id: string }>('/procedures', {
      name: 'Curativo pacote',
      priceCents: 15000,
      durationMinutes: 60,
    });
    // 10 sessões por R$ 1.000 → R$ 100 por sessão (preço avulso seria R$ 150).
    await post('/packages', {
      patientId: patient.id,
      procedureId: procedure.id,
      totalSessions: 10,
      priceCents: 100000,
    });

    await completeSession(patient.id, professional.id, procedure.id, '03');
    await completeSession(patient.id, professional.id, procedure.id, '04');

    const before = await report();
    const rowBefore = before.productionByProfessional.find(
      (row) => row.professionalId === professional.id,
    );
    expect(rowBefore).toMatchObject({
      count: 2,
      totalCents: 20000,
      commissionCents: 8000,
      releasedCommissionCents: 0,
      pendingCommissionCents: 8000,
    });
    expect(
      before.revenueByProcedure.find((r) => r.procedure === 'Curativo pacote')
        ?.totalCents,
    ).toBe(20000);

    // A fatura da venda do pacote é a vinculada ao pacote (session_package_id).
    const invoicesRoute = await import('@/app/api/invoices/route');
    const invoicesResponse = await invoicesRoute.GET(
      jsonRequest(`/api/invoices?patientId=${patient.id}`, 'GET'),
    );
    const invoices = (
      (await invoicesResponse.json()) as Envelope<
        Array<{ id: string; description: string }>
      >
    ).data;
    const packageInvoice = invoices.find((i) =>
      i.description.startsWith('Pacote:'),
    );
    expect(invoices).toHaveLength(1);
    await patch('/invoices', packageInvoice?.id as string, {
      action: 'pay',
      method: 'pix',
    });

    const after = await report();
    expect(
      after.productionByProfessional.find(
        (row) => row.professionalId === professional.id,
      ),
    ).toMatchObject({
      commissionCents: 8000,
      releasedCommissionCents: 8000,
      pendingCommissionCents: 0,
    });
  });
});
