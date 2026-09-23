import { describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { DrizzleProfessionalPatientLinkRepository } from '@/infrastructure/persistence/drizzle/professional-patient-link-repository';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Profissional que cadastra paciente ganha vínculo imediato (RBAC-17/18)', () => {
  it('Dado profissional autenticado, Quando POST /api/patients, Então o vínculo é gravado imediatamente', async () => {
    await ensureTestClinics();
    const patientsRoute = await import('@/app/api/patients/route');
    const headers = cookieHeaderFor(
      'profissional',
      'dra.ana@x.com',
      CLINIC_A_ID,
      'prof-link-1',
    );

    const { professionals } = await getRepositories(clinicScope(CLINIC_A_ID));
    await professionals.save(
      (await import('@/domain/professional/professional')).Professional.restore(
        {
          id: 'prof-link-1',
          fullName: 'Dra. Ana',
          registry: null,
          commissionPct: null,
          active: true,
          createdAt: new Date(),
        },
      ),
    );

    const response = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        {
          fullName: 'Paciente Vinculado',
          email: 'vinculado@x.com',
          phone: '11999990000',
        },
        headers,
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    expect(response.status).toBe(200);

    const { professionalPatientLinks } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    expect(
      await professionalPatientLinks.hasLink('prof-link-1', body.data.id),
    ).toBe(true);
  });

  it('Dado profissional sem professionalId na sessão, Quando POST /api/patients, Então cria paciente sem lançar (sem vínculo)', async () => {
    await ensureTestClinics();
    const patientsRoute = await import('@/app/api/patients/route');
    const headers = cookieHeaderFor(
      'profissional',
      'dr.sem-vinculo@x.com',
      CLINIC_A_ID,
      null,
    );

    const response = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        {
          fullName: 'Paciente Sem Vínculo',
          email: 'sem-vinculo-prof@x.com',
          phone: '11988887777',
        },
        headers,
      ),
    );

    expect(response.status).toBe(200);
  });

  it('Dado ensureLink falhando, Quando POST /api/patients, Então ainda cria o paciente e responde 200 (issue #42)', async () => {
    await ensureTestClinics();
    const patientsRoute = await import('@/app/api/patients/route');
    const headers = cookieHeaderFor(
      'profissional',
      'dra.bea@x.com',
      CLINIC_A_ID,
      'prof-link-2',
    );

    const { professionals } = await getRepositories(clinicScope(CLINIC_A_ID));
    await professionals.save(
      (await import('@/domain/professional/professional')).Professional.restore(
        {
          id: 'prof-link-2',
          fullName: 'Dra. Bea',
          registry: null,
          commissionPct: null,
          active: true,
          createdAt: new Date(),
        },
      ),
    );

    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const ensureLinkSpy = vi
      .spyOn(DrizzleProfessionalPatientLinkRepository.prototype, 'ensureLink')
      .mockRejectedValueOnce(new Error('banco indisponível'));

    try {
      const response = await patientsRoute.POST(
        jsonRequest(
          '/api/patients',
          'POST',
          {
            fullName: 'Paciente Resiliente',
            email: 'resiliente@x.com',
            phone: '11977776666',
          },
          headers,
        ),
      );
      const body = (await response.json()) as Envelope<{ id: string }>;

      expect(response.status).toBe(200);
      const { patients } = await getRepositories(clinicScope(CLINIC_A_ID));
      expect(await patients.findById(body.data.id)).not.toBeNull();
    } finally {
      ensureLinkSpy.mockRestore();
      errorLog.mockRestore();
    }
  });
});
