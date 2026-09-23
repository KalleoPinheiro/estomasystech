import { describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
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

describe('Feature: Guarda de vínculo Profissional-Paciente nas rotas clínicas (RBAC-17/19)', () => {
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
        { fullName: 'Paciente Guarda', email, phone: '11999990000' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  const routesUnderTest = [
    { name: '/api/patients/[id]', specifier: '@/app/api/patients/[id]/route' },
    {
      name: '/api/patients/[id]/evolutions',
      specifier: '@/app/api/patients/[id]/evolutions/route',
    },
    {
      name: '/api/patients/[id]/conditions',
      specifier: '@/app/api/patients/[id]/conditions/route',
    },
    {
      name: '/api/patients/[id]/anamnesis',
      specifier: '@/app/api/patients/[id]/anamnesis/route',
    },
    {
      name: '/api/patients/[id]/care-plans',
      specifier: '@/app/api/patients/[id]/care-plans/route',
    },
  ] as const;

  describe.each(routesUnderTest)('Cenário: $name', ({ specifier }) => {
    it('Dado profissional SEM vínculo, Quando GET, Então 404 (não vaza existência)', async () => {
      await ensureTestClinics();
      const professionalId = await createProfessional(
        `Dr. Sem Vínculo ${specifier}`,
      );
      const patientId = await createPatient(
        `sem-vinculo-${Math.random()}@x.com`,
      );

      const route = await import(specifier);
      const headers = cookieHeaderFor(
        'profissional',
        'dr@x.com',
        CLINIC_A_ID,
        professionalId,
      );
      const response = await route.GET(
        jsonRequest(`/api/patients/${patientId}`, 'GET', undefined, headers),
        { params: Promise.resolve({ id: patientId }) },
      );

      expect(response.status).toBe(404);
    });

    it('Dado profissional COM vínculo, Quando GET, Então sucesso', async () => {
      await ensureTestClinics();
      const professionalId = await createProfessional(
        `Dr. Com Vínculo ${specifier}`,
      );
      const patientId = await createPatient(
        `com-vinculo-${Math.random()}@x.com`,
      );

      const { professionalPatientLinks } = await getRepositories(
        clinicScope(CLINIC_A_ID),
      );
      await professionalPatientLinks.ensureLink(professionalId, patientId);

      const route = await import(specifier);
      const headers = cookieHeaderFor(
        'profissional',
        'dr@x.com',
        CLINIC_A_ID,
        professionalId,
      );
      const response = await route.GET(
        jsonRequest(`/api/patients/${patientId}`, 'GET', undefined, headers),
        { params: Promise.resolve({ id: patientId }) },
      );

      expect(response.status).toBe(200);
    });
  });

  describe('Cenário: outros papéis não são afetados pela guarda', () => {
    it('Dado company_admin sem vínculo nenhum, Quando GET /api/patients/[id], Então sucesso (guarda é só do profissional)', async () => {
      await ensureTestClinics();
      const patientId = await createPatient('admin-sem-vinculo@x.com');

      const route = await import('@/app/api/patients/[id]/route');
      const response = await route.GET(
        jsonRequest(
          `/api/patients/${patientId}`,
          'GET',
          undefined,
          adminCookieHeader(CLINIC_A_ID),
        ),
        { params: Promise.resolve({ id: patientId }) },
      );

      expect(response.status).toBe(200);
    });
  });
});
