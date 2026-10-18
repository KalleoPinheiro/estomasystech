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

  const createPatient = async (email: string, referredByPartnerId?: string) => {
    const route = await import('@/app/api/patients/route');
    const response = await route.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        {
          fullName: 'Paciente Guarda',
          email,
          phone: '11999990000',
          referredByPartnerId,
        },
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
    {
      name: '/api/patients/[id]/partner-consent',
      specifier: '@/app/api/patients/[id]/partner-consent/route',
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
  describe('Cenário: revogação do consentimento para o parceiro pela ficha (#292)', () => {
    it('Dado profissional SEM vínculo, Quando POST revoke, Então 404 e nada é gravado', async () => {
      await ensureTestClinics();
      const professionalId = await createProfessional('Dr. Sem Vínculo revoke');
      // Paciente indicado: sem o guarda, a revogação seria gravada (200).
      const partners = await import('@/app/api/partners/route');
      const partner = (await (
        await partners.POST(
          jsonRequest(
            '/api/partners',
            'POST',
            {
              fullName: 'Dra. Parceira Guarda',
              email: `parceira-guarda-${Math.random()}@x.com`,
              phone: '11933332222',
            },
            adminCookieHeader(CLINIC_A_ID),
          ),
        )
      ).json()) as Envelope<{ id: string }>;
      const patientId = await createPatient(
        `revoke-sem-vinculo-${Math.random()}@x.com`,
        partner.data.id,
      );

      const route = await import(
        '@/app/api/patients/[id]/partner-consent/revoke/route'
      );
      const response = await route.POST(
        jsonRequest(
          `/api/patients/${patientId}/partner-consent/revoke`,
          'POST',
          undefined,
          cookieHeaderFor(
            'profissional',
            'dr@x.com',
            CLINIC_A_ID,
            professionalId,
          ),
        ),
        { params: Promise.resolve({ id: patientId }) },
      );

      expect(response.status).toBe(404);
      const { partnerShareConsents } = await getRepositories(
        clinicScope(CLINIC_A_ID),
      );
      expect(await partnerShareConsents.findByPatientId(patientId)).toEqual([]);
    });
  });
});
