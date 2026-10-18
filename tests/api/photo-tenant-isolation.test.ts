import { describe, expect, it } from 'vitest';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest, multipartRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Isolamento de foto de condição por empresa (MT-21/MT-22)', () => {
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

  const createCondition = async (clinicId: string, patientId: string) => {
    const route = await import('@/app/api/patients/[id]/conditions/route');
    const response = await route.POST(
      jsonRequest(
        `/api/patients/${patientId}/conditions`,
        'POST',
        { kind: 'wound', title: 'Ferida operatória' },
        adminCookieHeader(clinicId),
      ),
      { params: Promise.resolve({ id: patientId }) },
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  const uploadPhoto = async (clinicId: string, conditionId: string) => {
    const route = await import('@/app/api/conditions/[id]/photos/route');
    const form = new FormData();
    form.set('file', new File([pngBytes], 'foto.png', { type: 'image/png' }));
    const response = await route.POST(
      multipartRequest(
        `/api/conditions/${conditionId}/photos`,
        form,
        adminCookieHeader(clinicId),
      ),
      { params: Promise.resolve({ id: conditionId }) },
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  it('Dada sessão da clínica A, Quando GET binário de foto criada na clínica B, Então 404', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'photo-b@x.com');
    const conditionB = await createCondition(CLINIC_B_ID, patientB);
    const photoB = await uploadPhoto(CLINIC_B_ID, conditionB);

    const byIdRoute = await import('@/app/api/photos/[id]/route');
    const response = await byIdRoute.GET(
      jsonRequest(
        `/api/photos/${photoB}`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: photoB }) },
    );

    expect(response.status).toBe(404);
  });

  it('Dada sessão da própria clínica, Quando GET binário da foto, Então retorna o conteúdo', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'photo-b2@x.com');
    const conditionB = await createCondition(CLINIC_B_ID, patientB);
    const photoB = await uploadPhoto(CLINIC_B_ID, conditionB);

    const byIdRoute = await import('@/app/api/photos/[id]/route');
    const response = await byIdRoute.GET(
      jsonRequest(
        `/api/photos/${photoB}`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
      { params: Promise.resolve({ id: photoB }) },
    );

    expect(response.status).toBe(200);
  });

  it('Dada sessão da clínica A, Quando PATCH (triagem) em foto da clínica B, Então 404', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'photo-b3@x.com');
    const conditionB = await createCondition(CLINIC_B_ID, patientB);
    const photoB = await uploadPhoto(CLINIC_B_ID, conditionB);

    const byIdRoute = await import('@/app/api/photos/[id]/route');
    const response = await byIdRoute.PATCH(
      jsonRequest(
        `/api/photos/${photoB}`,
        'PATCH',
        { triage: 'reviewed' },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: photoB }) },
    );

    expect(response.status).toBe(404);
  });
});
