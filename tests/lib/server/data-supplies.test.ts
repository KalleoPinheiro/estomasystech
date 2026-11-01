import { describe, expect, it } from 'vitest';
import type { Session } from '@/lib/auth/session';
import {
  getSupplyInsightsFor,
  listSuppliesFor,
  listSupplyMovementsFor,
} from '@/lib/server/data/supplies';
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

const call = async <T>(
  route: { GET?: Function; POST?: Function },
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  params?: { id: string },
): Promise<T> => {
  const handler = (route as Record<string, Function>)[method];
  const response = await handler(
    jsonRequest(path, method, body),
    params ? { params: Promise.resolve(params) } : undefined,
  );
  return ((await response.json()) as { data: T }).data;
};

describe('Feature: leituras de Materiais no servidor (#556)', () => {
  it('Dado insumo com entrada e baixa, Quando lê pela camada de dados, Então saldo, lote, previsão e histórico são os mesmos das rotas', async () => {
    await ensureTestClinics();
    const supplies = await import('@/app/api/supplies/route');
    const movements = await import('@/app/api/supplies/[id]/movements/route');
    const insights = await import('@/app/api/supplies/insights/route');
    const created = await call<{ id: string }>(
      supplies,
      'POST',
      '/api/supplies',
      { name: 'Gaze paridade', unit: 'pct', minQty: 2, priceCents: 1200 },
    );
    const movePath = `/api/supplies/${created.id}/movements`;
    await call(
      movements,
      'POST',
      movePath,
      {
        type: 'in',
        quantity: 10,
        reason: 'Compra',
        batchLabel: 'L-PAR',
        expiresAt: '2000-01-01T00:00:00.000Z',
      },
      { id: created.id },
    );
    await call(
      movements,
      'POST',
      movePath,
      {
        type: 'out',
        quantity: 3,
        reason: 'Uso',
      },
      { id: created.id },
    );

    const viaRoute = await call(supplies, 'GET', '/api/supplies');
    expect(await listSuppliesFor(session(CLINIC_A_ID))).toEqual(viaRoute);
    expect(await getSupplyInsightsFor(session(CLINIC_A_ID))).toEqual(
      await call(insights, 'GET', '/api/supplies/insights'),
    );
    const history = await listSupplyMovementsFor(
      session(CLINIC_A_ID),
      created.id,
    );
    expect(history).toEqual(
      await call(movements, 'GET', movePath, undefined, { id: created.id }),
    );
    expect(history).toHaveLength(2);
    const own = (await listSuppliesFor(session(CLINIC_A_ID))).find(
      (supply) => supply.id === created.id,
    );
    expect(own?.stockQty).toBe(7);
    const batch = (
      await getSupplyInsightsFor(session(CLINIC_A_ID))
    ).expiringBatches.find((item) => item.supplyId === created.id);
    expect(batch).toMatchObject({
      label: 'L-PAR',
      remaining: 7,
      isExpired: true,
    });
  });

  it('Dado insumo da clínica A, Quando a clínica B lê, Então não vê o insumo nem o histórico', async () => {
    await ensureTestClinics();
    const supplies = await import('@/app/api/supplies/route');
    const created = await call<{ id: string }>(
      supplies,
      'POST',
      '/api/supplies',
      { name: 'Só da A', unit: 'un', minQty: 0, priceCents: 100 },
    );

    const otherSupplies = await listSuppliesFor(session(CLINIC_B_ID));

    expect(otherSupplies.find((supply) => supply.id === created.id)).toBe(
      undefined,
    );
    expect(
      await listSupplyMovementsFor(session(CLINIC_B_ID), created.id),
    ).toEqual([]);
  });
});
