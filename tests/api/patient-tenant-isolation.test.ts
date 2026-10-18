import { beforeAll, describe, expect, it } from 'vitest';
import { systemScope } from '@/lib/auth/tenant-scope';
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

describe('Feature: Isolamento de Paciente por empresa (piloto multi-tenancy, MT-10..13)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');

  let patientAId: string;
  let patientBId: string;

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    await ensureTestClinics();
    patientsRoute = await import('@/app/api/patients/route');
    patientByIdRoute = await import('@/app/api/patients/[id]/route');

    const createInClinic = async (
      clinicId: string,
      fullName: string,
      email: string,
    ) => {
      const response = await patientsRoute.POST(
        jsonRequest(
          '/api/patients',
          'POST',
          { fullName, email, phone: '11999990000' },
          adminCookieHeader(clinicId),
        ),
      );
      const body = (await response.json()) as Envelope<{ id: string }>;
      return body.data.id;
    };

    patientAId = await createInClinic(
      CLINIC_A_ID,
      'Paciente da Clínica A',
      'paciente-a@x.com',
    );
    patientBId = await createInClinic(
      CLINIC_B_ID,
      'Paciente da Clínica B',
      'paciente-b@x.com',
    );
  });

  it('Dada sessão da clínica A, Quando GET /api/patients/:id de paciente da clínica B, Então 404', async () => {
    const response = await patientByIdRoute.GET(
      jsonRequest(
        `/api/patients/${patientBId}`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
      context(patientBId),
    );

    expect(response.status).toBe(404);
  });

  it('Dada sessão da clínica A, Quando GET /api/patients, Então lista não inclui paciente da clínica B', async () => {
    const response = await patientsRoute.GET(
      jsonRequest(
        '/api/patients',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(body.data.some((p) => p.id === patientBId)).toBe(false);
    expect(body.data.some((p) => p.id === patientAId)).toBe(true);
  });

  it('Dada sessão de papel de sistema (clinicId null), Quando GET /api/patients/:id de qualquer empresa, Então lê e audita com clinicId da empresa acessada', async () => {
    const { getRepositories } = await import('@/infrastructure/container');
    const systemCookie = { cookie: adminCookieHeader(null).cookie };

    const response = await patientByIdRoute.GET(
      jsonRequest(
        `/api/patients/${patientBId}`,
        'GET',
        undefined,
        systemCookie,
      ),
      context(patientBId),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;

    expect(response.status).toBe(200);
    expect(body.data.id).toBe(patientBId);

    // `after()` roda fire-and-forget: espera o evento aparecer em vez de
    // apostar num sleep fixo (padrão já usado em tests/api/portal-routes.test.ts).
    const { auditEvents } = await getRepositories(systemScope());
    const findReadEvent = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const events = await auditEvents.findAll({ patientId: patientBId });
        const match = events.find(
          (event) =>
            event.action === 'read' && event.resourceType === 'patient',
        );
        if (match) {
          return match;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return undefined;
    };
    const readEvent = await findReadEvent();

    expect(readEvent).toBeDefined();
    expect(readEvent?.clinicId).toBe(CLINIC_B_ID);
  });
});
