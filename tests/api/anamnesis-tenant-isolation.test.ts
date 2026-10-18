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

describe('Feature: Isolamento de Anamnese por empresa (MT-20)', () => {
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

  it('Dada sessão da clínica A, Quando GET anamnese de paciente da clínica B, Então retorna null', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'anam-b@x.com');

    const route = await import('@/app/api/patients/[id]/anamnesis/route');
    await route.PUT(
      jsonRequest(
        `/api/patients/${patientB}/anamnesis`,
        'PUT',
        { comorbidities: 'DM2' },
        adminCookieHeader(CLINIC_B_ID),
      ),
      { params: Promise.resolve({ id: patientB }) },
    );

    const response = await route.GET(
      jsonRequest(
        `/api/patients/${patientB}/anamnesis`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: patientB }) },
    );
    const body = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(200);
    expect(body.data).toBeNull();
  });

  it('Dada sessão da própria clínica, Quando GET anamnese, Então retorna os dados salvos', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'anam-b2@x.com');

    const route = await import('@/app/api/patients/[id]/anamnesis/route');
    await route.PUT(
      jsonRequest(
        `/api/patients/${patientB}/anamnesis`,
        'PUT',
        { comorbidities: 'Hipertensão' },
        adminCookieHeader(CLINIC_B_ID),
      ),
      { params: Promise.resolve({ id: patientB }) },
    );

    const response = await route.GET(
      jsonRequest(
        `/api/patients/${patientB}/anamnesis`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
      { params: Promise.resolve({ id: patientB }) },
    );
    const body = (await response.json()) as Envelope<{ comorbidities: string }>;

    expect(body.data.comorbidities).toBe('Hipertensão');
  });
});
