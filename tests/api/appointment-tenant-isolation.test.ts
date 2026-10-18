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

describe('Feature: Isolamento de Agendamento por empresa (MT-14)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let appointmentByIdRoute: typeof import('@/app/api/appointments/[id]/route');

  let patientAId: string;
  let patientBId: string;
  let appointmentBId: string;

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    await ensureTestClinics();
    patientsRoute = await import('@/app/api/patients/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    appointmentByIdRoute = await import('@/app/api/appointments/[id]/route');

    const createPatient = async (clinicId: string, email: string) => {
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

    patientAId = await createPatient(CLINIC_A_ID, 'agenda-a@x.com');
    patientBId = await createPatient(CLINIC_B_ID, 'agenda-b@x.com');

    const response = await appointmentsRoute.POST(
      jsonRequest(
        '/api/appointments',
        'POST',
        {
          patientId: patientBId,
          startsAt: '2027-05-10T09:00:00.000Z',
          endsAt: '2027-05-10T10:00:00.000Z',
          procedure: 'Troca de bolsa',
          priceCents: 15000,
        },
        adminCookieHeader(CLINIC_B_ID),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    appointmentBId = body.data.id;
  });

  it('Dada sessão da clínica A, Quando POST /api/appointments para paciente da clínica B, Então 404 (paciente não encontrado no escopo da clínica A)', async () => {
    const response = await appointmentsRoute.POST(
      jsonRequest(
        '/api/appointments',
        'POST',
        {
          patientId: patientBId,
          startsAt: '2027-05-11T09:00:00.000Z',
          endsAt: '2027-05-11T10:00:00.000Z',
          procedure: 'Troca de bolsa',
          priceCents: 15000,
        },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

    expect(response.status).toBe(404);
  });

  it('Dada sessão da clínica A, Quando GET /api/appointments/:id de consulta da clínica B, Então retorna null (mesmo comportamento de id inexistente)', async () => {
    const response = await appointmentByIdRoute.GET(
      jsonRequest(
        `/api/appointments/${appointmentBId}`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
      context(appointmentBId),
    );
    const body = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(200);
    expect(body.data).toBeNull();
  });

  it('Dada sessão da clínica A, Quando GET /api/appointments no período da consulta de B, Então lista não inclui a consulta da clínica B', async () => {
    const response = await appointmentsRoute.GET(
      jsonRequest(
        '/api/appointments?from=2027-05-10T00:00:00.000Z&to=2027-05-10T23:59:59.000Z',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(body.data.some((a) => a.id === appointmentBId)).toBe(false);
  });

  it('Dada sessão da clínica B, Quando GET /api/appointments/:id da própria consulta, Então retorna normalmente', async () => {
    const response = await appointmentByIdRoute.GET(
      jsonRequest(
        `/api/appointments/${appointmentBId}`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
      context(appointmentBId),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;

    expect(response.status).toBe(200);
    expect(body.data.id).toBe(appointmentBId);
  });

  it('Dada sessão da clínica A, Quando PATCH (confirm) em consulta da clínica B, Então 404', async () => {
    const response = await appointmentByIdRoute.PATCH(
      jsonRequest(
        `/api/appointments/${appointmentBId}`,
        'PATCH',
        { action: 'confirm' },
        adminCookieHeader(CLINIC_A_ID),
      ),
      context(appointmentBId),
    );

    expect(response.status).toBe(404);
  });

  // Referência: patientAId garante que a fixture da clínica A também tem paciente próprio,
  // evitando falso-positivo de isolamento por ausência total de dados na clínica A.
  it('Dada clínica A com paciente próprio, Quando POST /api/appointments para paciente da própria clínica, Então cria normalmente', async () => {
    const response = await appointmentsRoute.POST(
      jsonRequest(
        '/api/appointments',
        'POST',
        {
          patientId: patientAId,
          startsAt: '2027-05-12T09:00:00.000Z',
          endsAt: '2027-05-12T10:00:00.000Z',
          procedure: 'Troca de bolsa',
          priceCents: 15000,
        },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

    expect(response.status).toBe(200);
  });
});
