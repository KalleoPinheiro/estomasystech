import { describe, expect, it } from 'vitest';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Isolamento de Fatura, Pacote de Sessões e Consumo por empresa (MT-28)', () => {
  const createPatient = async (clinicId: string, email: string) => {
    const patientsRoute = await import('@/app/api/patients/route');
    const response = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName: 'Paciente Teste', email, phone: '11999990000' },
        adminCookieHeader(clinicId),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  const createInvoice = async (clinicId: string, patientId: string) => {
    const route = await import('@/app/api/invoices/route');
    const response = await route.POST(
      jsonRequest(
        '/api/invoices',
        'POST',
        { patientId, description: 'Consulta avulsa', amountCents: 15000 },
        adminCookieHeader(clinicId),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  const createProcedure = async (clinicId: string, name: string) => {
    const route = await import('@/app/api/procedures/route');
    const response = await route.POST(
      jsonRequest(
        '/api/procedures',
        'POST',
        { name, priceCents: 15000, durationMinutes: 40 },
        adminCookieHeader(clinicId),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  it('Dada sessão da clínica A, Quando GET /api/invoices, Então lista não inclui fatura da clínica B', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'invoice-b@x.com');
    const invoiceB = await createInvoice(CLINIC_B_ID, patientB);

    const route = await import('@/app/api/invoices/route');
    const response = await route.GET(
      jsonRequest(
        '/api/invoices',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(body.data.some((i) => i.id === invoiceB)).toBe(false);
  });

  it('Dada sessão da clínica A, Quando PATCH (pagar) em fatura da clínica B, Então falha', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'invoice-b2@x.com');
    const invoiceB = await createInvoice(CLINIC_B_ID, patientB);

    const byIdRoute = await import('@/app/api/invoices/[id]/route');
    const response = await byIdRoute.PATCH(
      jsonRequest(
        `/api/invoices/${invoiceB}`,
        'PATCH',
        { action: 'pay', method: 'pix' },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: invoiceB }) },
    );

    expect(response.status).toBe(404);
  });

  it('Dada sessão da clínica A, Quando GET /api/packages de paciente da clínica B, Então lista vazia', async () => {
    await ensureTestClinics();
    const procedureB = await createProcedure(
      CLINIC_B_ID,
      'Procedimento com pacote B',
    );
    const patientB = await createPatient(CLINIC_B_ID, 'package-b@x.com');

    const route = await import('@/app/api/packages/route');
    await route.POST(
      jsonRequest(
        '/api/packages',
        'POST',
        {
          patientId: patientB,
          procedureId: procedureB,
          totalSessions: 10,
          priceCents: 100000,
        },
        adminCookieHeader(CLINIC_B_ID),
      ),
    );

    const response = await route.GET(
      jsonRequest(
        `/api/packages?patientId=${patientB}`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<unknown[]>;

    expect(body.data).toHaveLength(0);
  });

  it('Dada sessão da própria clínica, Quando GET /api/packages, Então retorna o pacote criado', async () => {
    await ensureTestClinics();
    const procedureB = await createProcedure(
      CLINIC_B_ID,
      'Procedimento com pacote B2',
    );
    const patientB = await createPatient(CLINIC_B_ID, 'package-b2@x.com');

    const route = await import('@/app/api/packages/route');
    await route.POST(
      jsonRequest(
        '/api/packages',
        'POST',
        {
          patientId: patientB,
          procedureId: procedureB,
          totalSessions: 5,
          priceCents: 50000,
        },
        adminCookieHeader(CLINIC_B_ID),
      ),
    );

    const response = await route.GET(
      jsonRequest(
        `/api/packages?patientId=${patientB}`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
    );
    const body = (await response.json()) as Envelope<
      Array<{ totalSessions: number }>
    >;

    expect(body.data.some((p) => p.totalSessions === 5)).toBe(true);
  });
});
