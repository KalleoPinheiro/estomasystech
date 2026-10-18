import { beforeAll, describe, expect, it } from 'vitest';
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

describe('Feature: Isolamento do export LGPD de Paciente por empresa (issue #38)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let exportRoute: typeof import('@/app/api/patients/[id]/export/route');

  let patientAId: string;
  let patientBId: string;

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    await ensureTestClinics();
    patientsRoute = await import('@/app/api/patients/route');
    exportRoute = await import('@/app/api/patients/[id]/export/route');

    const createInClinic = async (
      clinicId: string,
      fullName: string,
      email: string,
    ) => {
      const response = await patientsRoute.POST(
        jsonRequest(
          '/api/patients',
          'POST',
          { fullName, email, phone: '11999990000' },
          adminCookieHeader(clinicId),
        ),
      );
      const body = (await response.json()) as Envelope<{ id: string }>;
      return body.data.id;
    };

    patientAId = await createInClinic(
      CLINIC_A_ID,
      'Paciente Export A',
      'paciente-export-a@x.com',
    );
    patientBId = await createInClinic(
      CLINIC_B_ID,
      'Paciente Export B',
      'paciente-export-b@x.com',
    );
  });

  it('Dada sessão da clínica A, Quando GET /api/patients/:id/export de paciente da clínica B, Então 404', async () => {
    const response = await exportRoute.GET(
      jsonRequest(
        `/api/patients/${patientBId}/export`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
      context(patientBId),
    );

    expect(response.status).toBe(404);
  });

  it('Dada sessão da clínica A, Quando GET /api/patients/:id/export do próprio paciente, Então 200 com dados', async () => {
    const response = await exportRoute.GET(
      jsonRequest(
        `/api/patients/${patientAId}/export`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
      context(patientAId),
    );
    const body = (await response.json()) as Envelope<{
      patient: { id: string };
    }>;

    expect(response.status).toBe(200);
    expect(body.data.patient.id).toBe(patientAId);
  });
});
