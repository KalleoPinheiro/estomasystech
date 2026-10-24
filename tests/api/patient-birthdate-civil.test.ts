import { beforeAll, describe, expect, it } from 'vitest';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

type Envelope<T> = { data: T };

describe('Feature: data de nascimento enviada como AAAA-MM-DD', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
    patientByIdRoute = await import('@/app/api/patients/[id]/route');
  });

  it('Dado birthDate 2000-01-01, Quando POST e PUT, Então guarda a meia-noite UTC desse dia', async () => {
    const created = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Paciente Data Civil',
        email: 'paciente.data.civil@example.com',
        phone: '11977776666',
        birthDate: '2000-01-01',
      }),
    );
    expect(created.status).toBe(200);
    const body = (await created.json()) as Envelope<{
      id: string;
      birthDate: string | null;
    }>;
    expect(body.data.birthDate).toBe('2000-01-01T00:00:00.000Z');

    const updated = await patientByIdRoute.PUT(
      jsonRequest(`/api/patients/${body.data.id}`, 'PUT', {
        birthDate: '1985-03-09',
      }),
      { params: Promise.resolve({ id: body.data.id }) },
    );
    const after = (await updated.json()) as Envelope<{
      birthDate: string | null;
    }>;
    expect(after.data.birthDate).toBe('1985-03-09T00:00:00.000Z');
  });
});
