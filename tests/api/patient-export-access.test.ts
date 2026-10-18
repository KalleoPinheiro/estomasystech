import { beforeAll, describe, expect, it } from 'vitest';
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

interface ExportDto {
  patient: { id: string };
  conditions: Array<{ notes: string | null }>;
}

const SECRET_NOTE = 'nota clínica sigilosa do export #185';

/**
 * Issue #185: a exportação LGPD entrega o prontuário completo, então só quem
 * pode ler o prontuário exporta — Atendente é negado pela família de rota
 * (403) e o Profissional sem vínculo recebe 404 (R4), como nas demais
 * subrotas clínicas de `/api/patients/:id/*`.
 */
describe('Feature: Acesso por papel ao export LGPD do paciente (#185)', () => {
  let exportRoute: typeof import('@/app/api/patients/[id]/export/route');
  let patientId: string;
  let linkedProfessionalId: string;
  let strangerProfessionalId: string;

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

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

  const professionalHeaders = (professionalId: string) =>
    cookieHeaderFor(
      'profissional',
      `${professionalId}@x.com`,
      CLINIC_A_ID,
      professionalId,
    );

  const exportAs = (headers: Record<string, string>) =>
    exportRoute.GET(
      jsonRequest(
        `/api/patients/${patientId}/export`,
        'GET',
        undefined,
        headers,
      ),
      context(patientId),
    );

  beforeAll(async () => {
    await ensureTestClinics();
    exportRoute = await import('@/app/api/patients/[id]/export/route');
    linkedProfessionalId = await createProfessional('Dr. Vinculado Export');
    strangerProfessionalId = await createProfessional('Dr. Sem Vínculo Export');

    // Cadastro pelo próprio Profissional cria o vínculo R4 na hora.
    const patientsRoute = await import('@/app/api/patients/route');
    const patientResponse = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        {
          fullName: 'Paciente Export Acesso',
          email: 'paciente-export-acesso@x.com',
          phone: '11999990000',
        },
        professionalHeaders(linkedProfessionalId),
      ),
    );
    const patient = (await patientResponse.json()) as Envelope<{ id: string }>;
    patientId = patient.data.id;

    const conditionsRoute = await import(
      '@/app/api/patients/[id]/conditions/route'
    );
    const conditionResponse = await conditionsRoute.POST(
      jsonRequest(
        `/api/patients/${patientId}/conditions`,
        'POST',
        { kind: 'wound', title: 'Úlcera export', notes: SECRET_NOTE },
        adminCookieHeader(CLINIC_A_ID),
      ),
      context(patientId),
    );
    expect(conditionResponse.status).toBe(200);
  });

  it('Dado atendente, Quando GET export, Então 403 sem dados', async () => {
    const response = await exportAs(
      cookieHeaderFor('atendente', 'atendente-export@x.com', CLINIC_A_ID),
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as Envelope<unknown>;
    expect(body.data).toBeNull();
    expect(JSON.stringify(body)).not.toContain(SECRET_NOTE);

    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    const exports = await auditEvents.findAll({
      resourceType: 'export',
      patientId,
    });
    expect(exports).toHaveLength(0);
  });

  it('Dado profissional sem vínculo, Quando GET export, Então 404', async () => {
    const response = await exportAs(
      professionalHeaders(strangerProfessionalId),
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as Envelope<unknown>;
    expect(body.data).toBeNull();
    expect(JSON.stringify(body)).not.toContain(SECRET_NOTE);
  });

  it('Dado profissional com vínculo, Quando GET export, Então 200', async () => {
    const response = await exportAs(professionalHeaders(linkedProfessionalId));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Envelope<ExportDto>;
    expect(body.data.patient.id).toBe(patientId);
  });

  it('Dado company_admin, Quando GET export, Então 200 com dado clínico', async () => {
    const response = await exportAs(adminCookieHeader(CLINIC_A_ID));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Envelope<ExportDto>;
    expect(body.data.patient.id).toBe(patientId);
    expect(body.data.conditions[0].notes).toBe(SECRET_NOTE);
  });
});
