import { describe, expect, it } from 'vitest';
import type { Session } from '@/lib/auth/session';
import {
  getProcedureKitFor,
  listProceduresFor,
} from '@/lib/server/data/procedures';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';
import { jsonRequest } from '../../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const session = (clinicId: string): Session =>
  ({
    role: 'company_admin',
    subject: 'admin@clinica.com',
    clinicId,
    professionalId: null,
  }) as unknown as Session;

const body = async <T>(response: Response): Promise<T> =>
  ((await response.json()) as { data: T }).data;

describe('Feature: leitura do kit do procedimento no servidor (#556)', () => {
  it('Dado procedimento com kit, Quando lê pela camada de dados, Então devolve o mesmo que GET /api/procedures/:id/kit', async () => {
    await ensureTestClinics();
    const procedures = await import('@/app/api/procedures/route');
    const supplies = await import('@/app/api/supplies/route');
    const kit = await import('@/app/api/procedures/[id]/kit/route');
    const procedure = await body<{ id: string }>(
      await procedures.POST(
        jsonRequest('/api/procedures', 'POST', {
          name: 'Curativo kit paridade',
          priceCents: 5000,
          durationMinutes: 30,
        }),
      ),
    );
    const supply = await body<{ id: string }>(
      await supplies.POST(
        jsonRequest('/api/supplies', 'POST', {
          name: 'Gaze kit paridade',
          unit: 'un',
          minQty: 1,
          priceCents: 100,
        }),
      ),
    );
    const params = { params: Promise.resolve({ id: procedure.id }) };
    await kit.PUT(
      jsonRequest(`/api/procedures/${procedure.id}/kit`, 'PUT', {
        items: [{ supplyId: supply.id, quantity: 3 }],
      }),
      params,
    );

    const viaRoute = await body(
      await kit.GET(
        jsonRequest(`/api/procedures/${procedure.id}/kit`, 'GET'),
        params,
      ),
    );

    expect(
      await getProcedureKitFor(session(CLINIC_A_ID), procedure.id),
    ).toEqual(viaRoute);
    expect(viaRoute).toEqual({ items: [{ supplyId: supply.id, quantity: 3 }] });
    const listed = await listProceduresFor(session(CLINIC_A_ID));
    expect(listed.find((item) => item.id === procedure.id)?.kitItemCount).toBe(
      1,
    );
  });

  it('Dado procedimento da clínica A, Quando a clínica B lê o kit, Então responde não encontrado', async () => {
    await ensureTestClinics();
    const procedures = await import('@/app/api/procedures/route');
    const procedure = await body<{ id: string }>(
      await procedures.POST(
        jsonRequest('/api/procedures', 'POST', {
          name: 'Só da A kit',
          priceCents: 1,
          durationMinutes: 10,
        }),
      ),
    );

    await expect(
      getProcedureKitFor(session(CLINIC_B_ID), procedure.id),
    ).rejects.toThrow(/Procedimento.*não encontrad/i);
  });
});
