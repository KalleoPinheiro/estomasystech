import { describe, expect, it } from 'vitest';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/**
 * Cenário completo de R4 (issue #31) ponta a ponta, consolidando o fluxo
 * narrado na spec — as peças individuais já são cobertas por
 * professional-patient-link-on-creation.test.ts (T16),
 * professional-patient-link-on-appointment-evolution.test.ts (T17) e
 * professional-patient-scope-guard.test.ts (T18); este teste garante que a
 * jornada inteira funciona encadeada, não só cada peça isolada.
 */
describe('Feature: Cenário completo de escopo dinâmico do Profissional (RBAC-17..21)', () => {
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
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  const getPatientAs = async (
    role: 'profissional',
    professionalId: string,
    patientId: string,
  ) => {
    const route = await import('@/app/api/patients/[id]/route');
    const headers = cookieHeaderFor(
      role,
      `${professionalId}@x.com`,
      CLINIC_A_ID,
      professionalId,
    );
    return route.GET(
      jsonRequest(`/api/patients/${patientId}`, 'GET', undefined, headers),
      {
        params: Promise.resolve({ id: patientId }),
      },
    );
  };

  it('cadastro sem agendamento, ausência de vínculo e transferência de caso — jornada completa', async () => {
    await ensureTestClinics();
    const drA = await createProfessional('Dr. A — Jornada Completa');
    const drB = await createProfessional('Dr. B — Jornada Completa');
    const drForasteiro = await createProfessional(
      'Dr. Forasteiro — Jornada Completa',
    );

    // 1) Dr. A cadastra o paciente — acesso imediato, antes de qualquer agendamento.
    const patientsRoute = await import('@/app/api/patients/route');
    const patientResponse = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        {
          fullName: 'Paciente Jornada',
          email: 'jornada-completa@x.com',
          phone: '11999990000',
        },
        cookieHeaderFor('profissional', `${drA}@x.com`, CLINIC_A_ID, drA),
      ),
    );
    expect(patientResponse.status).toBe(200);
    const patient = (await patientResponse.json()) as Envelope<{ id: string }>;
    const patientId = patient.data.id;

    const immediateAccess = await getPatientAs('profissional', drA, patientId);
    expect(immediateAccess.status).toBe(200);

    // 2) Dr. Forasteiro nunca teve contato — sem vínculo, 404 (não vaza existência).
    const forasteiroAccess = await getPatientAs(
      'profissional',
      drForasteiro,
      patientId,
    );
    expect(forasteiroAccess.status).toBe(404);

    // 3) Transferência de caso: Dr. B ganha agendamento com o mesmo paciente.
    const appointmentsRoute = await import('@/app/api/appointments/route');
    const appointmentResponse = await appointmentsRoute.POST(
      jsonRequest(
        '/api/appointments',
        'POST',
        {
          patientId,
          startsAt: '2026-10-01T09:00:00.000Z',
          endsAt: '2026-10-01T09:30:00.000Z',
          procedure: 'Retorno',
          priceCents: 10000,
          professionalId: drB,
        },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    expect(appointmentResponse.status).toBe(200);

    // 4) Ambos mantêm acesso ao paciente após a transferência — Dr. A ao
    // histórico de quando atendeu, Dr. B ao que passa a registrar dali em diante.
    const drAAfterTransfer = await getPatientAs('profissional', drA, patientId);
    const drBAfterTransfer = await getPatientAs('profissional', drB, patientId);
    expect(drAAfterTransfer.status).toBe(200);
    expect(drBAfterTransfer.status).toBe(200);

    // 5) Dr. Forasteiro continua sem acesso — a transferência não abriu a porta pra ele.
    const forasteiroStillDenied = await getPatientAs(
      'profissional',
      drForasteiro,
      patientId,
    );
    expect(forasteiroStillDenied.status).toBe(404);
  });
});
