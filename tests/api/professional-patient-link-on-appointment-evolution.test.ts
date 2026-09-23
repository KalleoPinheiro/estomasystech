import { describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { DrizzleProfessionalPatientLinkRepository } from '@/infrastructure/persistence/drizzle/professional-patient-link-repository';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Agendamento e evolução com profissional criam vínculo (RBAC-19/20/21)', () => {
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

  const createPatient = async (email: string) => {
    const route = await import('@/app/api/patients/route');
    const response = await route.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName: 'Paciente Vínculo', email, phone: '11999990000' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  it('Dado agendamento com professionalId, Quando POST /api/appointments, Então grava o vínculo', async () => {
    await ensureTestClinics();
    const professionalId = await createProfessional('Dr. Vínculo Agenda');
    const patientId = await createPatient('vinculo-agenda@x.com');

    const route = await import('@/app/api/appointments/route');
    const response = await route.POST(
      jsonRequest(
        '/api/appointments',
        'POST',
        {
          patientId,
          startsAt: '2026-09-01T09:00:00.000Z',
          endsAt: '2026-09-01T09:30:00.000Z',
          procedure: 'Troca de bolsa',
          priceCents: 10000,
          professionalId,
        },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    expect(response.status).toBe(200);

    const { professionalPatientLinks } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    expect(
      await professionalPatientLinks.hasLink(professionalId, patientId),
    ).toBe(true);
  });

  it('Dado profissional autenticado com nota de evolução, Quando POST evolutions, Então renova o vínculo (#64: autoria sempre da sessão)', async () => {
    await ensureTestClinics();
    const professionalId = await createProfessional('Dr. Vínculo Evolução');
    const patientId = await createPatient('vinculo-evolucao@x.com');

    // Vínculo inicial via agendamento (fluxo legítimo de atribuição, distinto
    // de autoria de nota clínica) — evolução sozinha não cria vínculo do zero
    // para um profissional sem nenhum vínculo prévio (R4/#64).
    const appointmentsRoute = await import('@/app/api/appointments/route');
    await appointmentsRoute.POST(
      jsonRequest(
        '/api/appointments',
        'POST',
        {
          patientId,
          startsAt: '2026-09-02T09:00:00.000Z',
          endsAt: '2026-09-02T09:30:00.000Z',
          procedure: 'Troca de bolsa',
          priceCents: 10000,
          professionalId,
        },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

    const route = await import('@/app/api/patients/[id]/evolutions/route');
    const response = await route.POST(
      jsonRequest(
        `/api/patients/${patientId}/evolutions`,
        'POST',
        { subjective: 'Relato' },
        cookieHeaderFor('profissional', undefined, CLINIC_A_ID, professionalId),
      ),
      { params: Promise.resolve({ id: patientId }) },
    );
    const body = (await response.json()) as Envelope<{
      professionalId: string | null;
    }>;

    expect(response.status).toBe(200);
    expect(body.data.professionalId).toBe(professionalId);

    const { professionalPatientLinks } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    expect(
      await professionalPatientLinks.hasLink(professionalId, patientId),
    ).toBe(true);
  });

  it('Dado ensureLink falhando, Quando POST /api/appointments, Então ainda cria a consulta e responde 200 (issue #42)', async () => {
    await ensureTestClinics();
    const professionalId = await createProfessional('Dr. Resiliente Agenda');
    const patientId = await createPatient('resiliente-agenda@x.com');

    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const ensureLinkSpy = vi
      .spyOn(DrizzleProfessionalPatientLinkRepository.prototype, 'ensureLink')
      .mockRejectedValueOnce(new Error('banco indisponível'));

    try {
      const route = await import('@/app/api/appointments/route');
      const response = await route.POST(
        jsonRequest(
          '/api/appointments',
          'POST',
          {
            patientId,
            startsAt: '2026-09-04T09:00:00.000Z',
            endsAt: '2026-09-04T09:30:00.000Z',
            procedure: 'Troca de bolsa',
            priceCents: 10000,
            professionalId,
          },
          adminCookieHeader(CLINIC_A_ID),
        ),
      );
      const body = (await response.json()) as Envelope<{ id: string }>;

      expect(response.status).toBe(200);
      const { appointments } = await getRepositories(clinicScope(CLINIC_A_ID));
      expect(await appointments.findById(body.data.id)).not.toBeNull();
    } finally {
      ensureLinkSpy.mockRestore();
      errorLog.mockRestore();
    }
  });

  it('Dado ensureLink falhando, Quando POST evolutions, Então ainda cria a nota e responde 200 (issue #42)', async () => {
    await ensureTestClinics();
    const professionalId = await createProfessional('Dr. Resiliente Evolução');
    const patientId = await createPatient('resiliente-evolucao@x.com');

    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const ensureLinkSpy = vi
      .spyOn(DrizzleProfessionalPatientLinkRepository.prototype, 'ensureLink')
      .mockRejectedValueOnce(new Error('banco indisponível'));

    try {
      const route = await import('@/app/api/patients/[id]/evolutions/route');
      const response = await route.POST(
        jsonRequest(
          `/api/patients/${patientId}/evolutions`,
          'POST',
          { subjective: 'Relato', professionalId },
          adminCookieHeader(CLINIC_A_ID),
        ),
        { params: Promise.resolve({ id: patientId }) },
      );
      const body = (await response.json()) as Envelope<{ id: string }>;

      expect(response.status).toBe(200);
      const { evolutions } = await getRepositories(clinicScope(CLINIC_A_ID));
      const notes = await evolutions.findByPatientId(patientId);
      expect(notes.some((note) => note.id === body.data.id)).toBe(true);
    } finally {
      ensureLinkSpy.mockRestore();
      errorLog.mockRestore();
    }
  });

  describe('Cenário: transferência de caso entre profissionais', () => {
    it('Dado Dr. A já atendeu o paciente, Quando Dr. B ganha agendamento com o mesmo paciente, Então ambos mantêm o vínculo', async () => {
      await ensureTestClinics();
      const drA = await createProfessional('Dr. A Transferência');
      const drB = await createProfessional('Dr. B Transferência');
      const patientId = await createPatient('transferencia-caso@x.com');

      const appointmentsRoute = await import('@/app/api/appointments/route');
      await appointmentsRoute.POST(
        jsonRequest(
          '/api/appointments',
          'POST',
          {
            patientId,
            startsAt: '2026-09-02T09:00:00.000Z',
            endsAt: '2026-09-02T09:30:00.000Z',
            procedure: 'Consulta inicial',
            priceCents: 10000,
            professionalId: drA,
          },
          adminCookieHeader(CLINIC_A_ID),
        ),
      );

      await appointmentsRoute.POST(
        jsonRequest(
          '/api/appointments',
          'POST',
          {
            patientId,
            startsAt: '2026-09-03T09:00:00.000Z',
            endsAt: '2026-09-03T09:30:00.000Z',
            procedure: 'Retorno',
            priceCents: 10000,
            professionalId: drB,
          },
          adminCookieHeader(CLINIC_A_ID),
        ),
      );

      const { professionalPatientLinks } = await getRepositories(
        clinicScope(CLINIC_A_ID),
      );
      expect(await professionalPatientLinks.hasLink(drA, patientId)).toBe(true);
      expect(await professionalPatientLinks.hasLink(drB, patientId)).toBe(true);
    });
  });
});
