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
 * Cenário de negócio de R3 (issue #30): Atendente acessa agenda e cadastro de
 * paciente/parceiro, mas nunca dado clínico (evolução, avaliação, foto).
 * Distinto do sweep genérico de conformidade (route-guard-conformance.test.ts,
 * T8) — este teste fixa exatamente as ACs da issue, não a matriz inteira.
 */
describe('Feature: Restrição operacional do Atendente (RBAC-15/16)', () => {
  const atendenteHeaders = () =>
    cookieHeaderFor('atendente', 'atendente@x.com', CLINIC_A_ID);

  const createPatient = async (email: string) => {
    const patientsRoute = await import('@/app/api/patients/route');
    const response = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName: 'Paciente Atendente', email, phone: '11999990000' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  describe('Cenário: caminho permitido — agenda e cadastro de paciente/parceiro', () => {
    it('Dado atendente, Quando GET /api/appointments, Então sucesso', async () => {
      await ensureTestClinics();
      const route = await import('@/app/api/appointments/route');
      const response = await route.GET(
        jsonRequest(
          '/api/appointments?from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z',
          'GET',
          undefined,
          atendenteHeaders(),
        ),
      );

      expect(response.status).toBe(200);
    });

    it('Dado atendente, Quando GET /api/patients, Então sucesso', async () => {
      await ensureTestClinics();
      const route = await import('@/app/api/patients/route');
      const response = await route.GET(
        jsonRequest('/api/patients', 'GET', undefined, atendenteHeaders()),
      );

      expect(response.status).toBe(200);
    });

    it('Dado atendente, Quando POST /api/patients, Então sucesso (cadastra paciente)', async () => {
      await ensureTestClinics();
      const route = await import('@/app/api/patients/route');
      const response = await route.POST(
        jsonRequest(
          '/api/patients',
          'POST',
          {
            fullName: 'Paciente Novo',
            email: 'novo-atendente@x.com',
            phone: '11988887777',
          },
          atendenteHeaders(),
        ),
      );

      expect(response.status).toBe(200);
    });

    it('Dado atendente, Quando GET /api/partners, Então sucesso', async () => {
      await ensureTestClinics();
      const route = await import('@/app/api/partners/route');
      const response = await route.GET(
        jsonRequest('/api/partners', 'GET', undefined, atendenteHeaders()),
      );

      expect(response.status).toBe(200);
    });
  });

  describe('Cenário: caminho negado — dado clínico', () => {
    it('Dado atendente, Quando GET evoluções de um paciente, Então 403', async () => {
      await ensureTestClinics();
      const patientId = await createPatient('evo-atendente@x.com');
      const route = await import('@/app/api/patients/[id]/evolutions/route');
      const response = await route.GET(
        jsonRequest(
          `/api/patients/${patientId}/evolutions`,
          'GET',
          undefined,
          atendenteHeaders(),
        ),
        { params: Promise.resolve({ id: patientId }) },
      );

      expect(response.status).toBe(403);
    });

    it('Dado atendente, Quando GET avaliações de condição, Então 403', async () => {
      await ensureTestClinics();
      const route = await import('@/app/api/conditions/[id]/assessments/route');
      const response = await route.GET(
        jsonRequest(
          '/api/conditions/x/assessments',
          'GET',
          undefined,
          atendenteHeaders(),
        ),
        { params: Promise.resolve({ id: 'x' }) },
      );

      expect(response.status).toBe(403);
    });

    it('Dado atendente, Quando GET fotos de condição, Então 403', async () => {
      await ensureTestClinics();
      const route = await import('@/app/api/conditions/[id]/photos/route');
      const response = await route.GET(
        jsonRequest(
          '/api/conditions/x/photos',
          'GET',
          undefined,
          atendenteHeaders(),
        ),
        { params: Promise.resolve({ id: 'x' }) },
      );

      expect(response.status).toBe(403);
    });
  });
});
