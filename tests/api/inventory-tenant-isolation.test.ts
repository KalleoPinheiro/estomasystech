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

describe('Feature: Isolamento de Suprimento, Lote e Movimento de Estoque por empresa (MT-23)', () => {
  const createSupply = async (clinicId: string, name: string) => {
    const route = await import('@/app/api/supplies/route');
    const response = await route.POST(
      jsonRequest(
        '/api/supplies',
        'POST',
        { name, unit: 'un', minQty: 5, priceCents: 1000 },
        adminCookieHeader(clinicId),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  it('Dada sessão da clínica A, Quando GET /api/supplies, Então lista não inclui insumo exclusivo da clínica B', async () => {
    await ensureTestClinics();
    const idB = await createSupply(CLINIC_B_ID, 'Insumo exclusivo B');

    const route = await import('@/app/api/supplies/route');
    const response = await route.GET(
      jsonRequest(
        '/api/supplies',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(body.data.some((s) => s.id === idB)).toBe(false);
  });

  it('Dada sessão da clínica A, Quando PUT em insumo da clínica B, Então falha', async () => {
    await ensureTestClinics();
    const idB = await createSupply(
      CLINIC_B_ID,
      'Insumo só edita na própria clínica',
    );

    const byIdRoute = await import('@/app/api/supplies/[id]/route');
    const response = await byIdRoute.PUT(
      jsonRequest(
        `/api/supplies/${idB}`,
        'PUT',
        { priceCents: 9999 },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: idB }) },
    );

    expect(response.status).toBe(404);
  });

  it('Dada sessão da clínica A, Quando registrar movimento em insumo da clínica B, Então falha', async () => {
    await ensureTestClinics();
    const idB = await createSupply(
      CLINIC_B_ID,
      'Insumo movimenta só na própria clínica',
    );

    const movementsRoute = await import(
      '@/app/api/supplies/[id]/movements/route'
    );
    const response = await movementsRoute.POST(
      jsonRequest(
        `/api/supplies/${idB}/movements`,
        'POST',
        { type: 'in', quantity: 10, reason: 'Compra' },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: idB }) },
    );

    expect(response.status).toBe(404);
  });

  it('Dada sessão da própria clínica, Quando registrar movimento, Então funciona e reflete no estoque', async () => {
    await ensureTestClinics();
    const idB = await createSupply(CLINIC_B_ID, 'Insumo movimenta normalmente');

    const movementsRoute = await import(
      '@/app/api/supplies/[id]/movements/route'
    );
    const response = await movementsRoute.POST(
      jsonRequest(
        `/api/supplies/${idB}/movements`,
        'POST',
        { type: 'in', quantity: 10, reason: 'Compra' },
        adminCookieHeader(CLINIC_B_ID),
      ),
      { params: Promise.resolve({ id: idB }) },
    );
    const body = (await response.json()) as Envelope<{ stockQty: number }>;

    expect(response.status).toBe(200);
    expect(body.data.stockQty).toBe(10);
  });
});
