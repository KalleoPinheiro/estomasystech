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

describe('Feature: Isolamento de Retorno e Lembrete por empresa (MT-27)', () => {
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

  const createFollowUp = async (clinicId: string, patientId: string) => {
    const route = await import('@/app/api/follow-ups/route');
    const response = await route.POST(
      jsonRequest(
        '/api/follow-ups',
        'POST',
        {
          patientId,
          dueDate: '2027-06-01T00:00:00.000Z',
          reason: 'Retorno de curativo',
        },
        adminCookieHeader(clinicId),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  it('Dada sessão da clínica A, Quando GET /api/follow-ups, Então lista não inclui retorno da clínica B', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'followup-b@x.com');
    const followUpB = await createFollowUp(CLINIC_B_ID, patientB);

    const route = await import('@/app/api/follow-ups/route');
    const response = await route.GET(
      jsonRequest(
        '/api/follow-ups',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(body.data.some((f) => f.id === followUpB)).toBe(false);
  });

  it('Dada sessão da clínica A, Quando PATCH em retorno da clínica B, Então falha', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'followup-b2@x.com');
    const followUpB = await createFollowUp(CLINIC_B_ID, patientB);

    const byIdRoute = await import('@/app/api/follow-ups/[id]/route');
    const response = await byIdRoute.PATCH(
      jsonRequest(
        `/api/follow-ups/${followUpB}`,
        'PATCH',
        { status: 'done' },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: followUpB }) },
    );

    expect(response.status).toBe(404);
  });
});
