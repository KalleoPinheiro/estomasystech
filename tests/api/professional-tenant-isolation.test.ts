import { describe, expect, it } from 'vitest';
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

describe('Feature: Isolamento de Profissional por empresa (MT-19)', () => {
  const createProfessional = async (clinicId: string, fullName: string) => {
    const route = await import('@/app/api/professionals/route');
    const response = await route.POST(
      jsonRequest(
        '/api/professionals',
        'POST',
        { fullName },
        adminCookieHeader(clinicId),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  it('Dada sessão da clínica A, Quando GET /api/professionals, Então lista não inclui profissional da clínica B', async () => {
    await ensureTestClinics();
    const idB = await createProfessional(CLINIC_B_ID, 'Dr. Exclusivo da B');

    const route = await import('@/app/api/professionals/route');
    const response = await route.GET(
      jsonRequest(
        '/api/professionals',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(body.data.some((p) => p.id === idB)).toBe(false);
  });

  it('Dada sessão da clínica A, Quando PATCH em profissional da clínica B, Então 404', async () => {
    await ensureTestClinics();
    const idB = await createProfessional(
      CLINIC_B_ID,
      'Dr. Só edita na própria clínica',
    );

    const byIdRoute = await import('@/app/api/professionals/[id]/route');
    const response = await byIdRoute.PATCH(
      jsonRequest(
        `/api/professionals/${idB}`,
        'PATCH',
        { fullName: 'Tentativa de edição cross-empresa' },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: idB }) },
    );

    expect(response.status).toBe(404);
  });
});
