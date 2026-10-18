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

describe('Feature: Isolamento de Plano de Cuidado, Avaliação de Desfecho e Registro de Intervenção por empresa (MT-20)', () => {
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

  const createCarePlan = async (clinicId: string, patientId: string) => {
    const route = await import('@/app/api/patients/[id]/care-plans/route');
    const response = await route.POST(
      jsonRequest(
        `/api/patients/${patientId}/care-plans`,
        'POST',
        {},
        adminCookieHeader(clinicId),
      ),
      { params: Promise.resolve({ id: patientId }) },
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  it('Dada sessão da clínica A, Quando GET /api/care-plans/:id de plano da clínica B, Então falha (não encontrado no escopo da clínica A)', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'cp-b@x.com');
    const planB = await createCarePlan(CLINIC_B_ID, patientB);

    const byIdRoute = await import('@/app/api/care-plans/[id]/route');
    const response = await byIdRoute.GET(
      jsonRequest(
        `/api/care-plans/${planB}`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: planB }) },
    );

    expect(response.status).toBe(404);
  });

  it('Dada sessão da clínica A, Quando GET planos de cuidado de paciente da clínica B, Então lista vazia', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'cp-b2@x.com');
    await createCarePlan(CLINIC_B_ID, patientB);

    const route = await import('@/app/api/patients/[id]/care-plans/route');
    const response = await route.GET(
      jsonRequest(
        `/api/patients/${patientB}/care-plans`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: patientB }) },
    );
    const body = (await response.json()) as Envelope<unknown[]>;

    expect(body.data).toHaveLength(0);
  });

  it('Dada sessão da clínica A, Quando PATCH (resolve) em plano da clínica B, Então 404', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'cp-b3@x.com');
    const planB = await createCarePlan(CLINIC_B_ID, patientB);

    const byIdRoute = await import('@/app/api/care-plans/[id]/route');
    const response = await byIdRoute.PATCH(
      jsonRequest(
        `/api/care-plans/${planB}`,
        'PATCH',
        { action: 'resolve' },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: planB }) },
    );

    expect(response.status).toBe(404);
  });

  it('Dada sessão da própria clínica, Quando GET /api/care-plans/:id, Então retorna o plano', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'cp-b4@x.com');
    const planB = await createCarePlan(CLINIC_B_ID, patientB);

    const byIdRoute = await import('@/app/api/care-plans/[id]/route');
    const response = await byIdRoute.GET(
      jsonRequest(
        `/api/care-plans/${planB}`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
      { params: Promise.resolve({ id: planB }) },
    );
    const body = (await response.json()) as Envelope<{ plan: { id: string } }>;

    expect(response.status).toBe(200);
    expect(body.data.plan.id).toBe(planB);
  });
});
