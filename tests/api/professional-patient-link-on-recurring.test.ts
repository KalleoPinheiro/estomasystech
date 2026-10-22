import { describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Série recorrente com profissional cria vínculo (PRO-RN-08, #465)', () => {
  const createProfessional = async (fullName: string) => {
    const route = await import('@/app/api/professionals/route');
    const response = await route.POST(
      jsonRequest(
        '/api/professionals',
        'POST',
        { fullName },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    return ((await response.json()) as Envelope<{ id: string }>).data.id;
  };

  const createPatient = async (email: string) => {
    const route = await import('@/app/api/patients/route');
    const response = await route.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName: 'Paciente Recorrente', email, phone: '11999990000' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    return ((await response.json()) as Envelope<{ id: string }>).data.id;
  };

  const scheduleSeries = async (
    patientId: string,
    professionalId: string,
    startsAt: string,
    endsAt: string,
  ) => {
    const route = await import('@/app/api/appointments/recurring/route');
    return route.POST(
      jsonRequest(
        '/api/appointments/recurring',
        'POST',
        {
          patientId,
          startsAt,
          endsAt,
          procedure: 'Troca de curativo',
          priceCents: 12000,
          professionalId,
          occurrences: 2,
        },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
  };

  it('Dado a recepção agendando série com profissional, Quando POST recorrente, Então o profissional abre o prontuário do paciente', async () => {
    await ensureTestClinics();
    const professionalId = await createProfessional('Dra. Série Semanal');
    const patientId = await createPatient('serie-semanal@x.com');

    const response = await scheduleSeries(
      patientId,
      professionalId,
      '2027-05-03T12:00:00.000Z',
      '2027-05-03T13:00:00.000Z',
    );
    expect(response.status).toBe(200);

    const { professionalPatientLinks } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    expect(
      await professionalPatientLinks.hasLink(professionalId, patientId),
    ).toBe(true);

    const patientRoute = await import('@/app/api/patients/[id]/route');
    const opened = await patientRoute.GET(
      jsonRequest(
        `/api/patients/${patientId}`,
        'GET',
        undefined,
        cookieHeaderFor('profissional', undefined, CLINIC_A_ID, professionalId),
      ),
      { params: Promise.resolve({ id: patientId }) },
    );
    expect(opened.status).toBe(200);
  });

  it('Dado série em que nenhuma ocorrência é criada, Quando POST recorrente, Então não concede vínculo', async () => {
    await ensureTestClinics();
    const professionalId = await createProfessional('Dr. Série Vazia');
    const patientId = await createPatient('serie-vazia@x.com');

    // Sábados: fora da grade da clínica, todas as ocorrências são puladas.
    const response = await scheduleSeries(
      patientId,
      professionalId,
      '2027-05-08T12:00:00.000Z',
      '2027-05-08T13:00:00.000Z',
    );
    const body = (await response.json()) as Envelope<{ created: unknown[] }>;
    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(0);

    const { professionalPatientLinks } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    expect(
      await professionalPatientLinks.hasLink(professionalId, patientId),
    ).toBe(false);
  });
});
