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

describe('Feature: Isolamento de Procedimento por empresa (MT-15/MT-16)', () => {
  const createProcedure = async (clinicId: string, name: string) => {
    const proceduresRoute = await import('@/app/api/procedures/route');
    const response = await proceduresRoute.POST(
      jsonRequest(
        '/api/procedures',
        'POST',
        { name, priceCents: 15000, durationMinutes: 40 },
        adminCookieHeader(clinicId),
      ),
    );
    const body = (await response.json()) as Envelope<{
      id: string;
      name: string;
    }>;
    return { response, body };
  };

  it('Dado nome já usado na própria clínica, Quando criar de novo, Então 400', async () => {
    await ensureTestClinics();
    const { response } = await createProcedure(
      CLINIC_A_ID,
      'Consulta duplicada A',
    );

    expect(response.status).toBe(200);

    const dupe = await createProcedure(CLINIC_A_ID, 'Consulta duplicada A');
    expect(dupe.response.status).toBe(400);
  });

  it('Dado o mesmo nome em duas clínicas distintas, Quando criar em ambas, Então não colide (unicidade composta)', async () => {
    await ensureTestClinics();
    const nameShared = 'Curativo compartilhado';

    const first = await createProcedure(CLINIC_A_ID, nameShared);
    const second = await createProcedure(CLINIC_B_ID, nameShared);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(first.body.data.id).not.toBe(second.body.data.id);
  });

  it('Dada sessão da clínica A, Quando GET /api/procedures, Então lista não inclui procedimento exclusivo da clínica B', async () => {
    await ensureTestClinics();
    const { body: created } = await createProcedure(
      CLINIC_B_ID,
      'Exclusivo da clínica B',
    );

    const proceduresRoute = await import('@/app/api/procedures/route');
    const response = await proceduresRoute.GET(
      jsonRequest(
        '/api/procedures',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(body.data.some((p) => p.id === created.data.id)).toBe(false);
  });

  it('Dada sessão da clínica A, Quando PATCH em procedimento da clínica B, Então 404', async () => {
    await ensureTestClinics();
    const { body: created } = await createProcedure(
      CLINIC_B_ID,
      'Só edita na própria clínica',
    );

    const procedureByIdRoute = await import('@/app/api/procedures/[id]/route');
    const response = await procedureByIdRoute.PATCH(
      jsonRequest(
        `/api/procedures/${created.data.id}`,
        'PATCH',
        { priceCents: 99999 },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: created.data.id }) },
    );

    expect(response.status).toBe(404);
  });
});
