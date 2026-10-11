import { beforeAll, describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/**
 * Issue #219: a FK `professional_id` é global — sem validação, a rota aceitava
 * profissional de outra empresa e ainda criava o vínculo R4 com ele.
 */
describe('Feature: Rotas de agenda validam o profissional na empresa (issue #219)', () => {
  let patientAId: string;
  let professionalBId: string;
  let inactiveProfessionalAId: string;

  const create = async <T>(
    path: string,
    body: Record<string, unknown>,
    clinicId: string,
  ): Promise<T> => {
    const route = (await import(
      path === '/api/patients'
        ? '@/app/api/patients/route'
        : '@/app/api/professionals/route'
    )) as { POST: (r: Request) => Promise<Response> };
    const response = await route.POST(
      jsonRequest(path, 'POST', body, adminCookieHeader(clinicId)),
    );
    return ((await response.json()) as Envelope<T>).data;
  };

  beforeAll(async () => {
    await ensureTestClinics();
    patientAId = (
      await create<{ id: string }>(
        '/api/patients',
        {
          fullName: 'Paciente Agenda',
          email: 'agenda-219@x.com',
          phone: '11999990000',
        },
        CLINIC_A_ID,
      )
    ).id;
    professionalBId = (
      await create<{ id: string }>(
        '/api/professionals',
        { fullName: 'Dra. Outra Empresa' },
        CLINIC_B_ID,
      )
    ).id;
    inactiveProfessionalAId = (
      await create<{ id: string }>(
        '/api/professionals',
        { fullName: 'Dra. Inativa' },
        CLINIC_A_ID,
      )
    ).id;
    const { professionals } = await getRepositories(clinicScope(CLINIC_A_ID));
    const inactive = await professionals.findById(inactiveProfessionalAId);
    if (!inactive) throw new Error('Profissional de teste não criado');
    await professionals.save(inactive.deactivate());
  });

  const appointment = (professionalId: string, day: string) => ({
    patientId: patientAId,
    startsAt: `2027-06-${day}T09:00:00.000Z`,
    endsAt: `2027-06-${day}T10:00:00.000Z`,
    procedure: 'Troca de bolsa',
    priceCents: 15000,
    professionalId,
  });

  it('Dado profissional de outra empresa, Quando POST /api/appointments, Então 404 sem UUID na mensagem e sem vínculo', async () => {
    const route = await import('@/app/api/appointments/route');
    const response = await route.POST(
      jsonRequest(
        '/api/appointments',
        'POST',
        appointment(professionalBId, '07'),
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as Envelope<null>;
    expect(body.error).toBe('Profissional não encontrado(a)');

    const { professionalPatientLinks } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    expect(
      await professionalPatientLinks.hasLink(professionalBId, patientAId),
    ).toBe(false);
  });

  it('Dado profissional inativo, Quando POST /api/appointments, Então 400', async () => {
    const route = await import('@/app/api/appointments/route');
    const response = await route.POST(
      jsonRequest(
        '/api/appointments',
        'POST',
        appointment(inactiveProfessionalAId, '08'),
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

    expect(response.status).toBe(400);
  });

  it('Dado profissional de outra empresa, Quando POST /api/appointments/recurring, Então 404 e nada é criado', async () => {
    const route = await import('@/app/api/appointments/recurring/route');
    const response = await route.POST(
      jsonRequest(
        '/api/appointments/recurring',
        'POST',
        { ...appointment(professionalBId, '09'), occurrences: 2 },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

    expect(response.status).toBe(404);
    const { appointments } = await getRepositories(clinicScope(CLINIC_A_ID));
    expect(
      await appointments.findInRange(
        new Date('2027-06-09T00:00:00.000Z'),
        new Date('2027-06-20T00:00:00.000Z'),
      ),
    ).toEqual([]);
  });
});
