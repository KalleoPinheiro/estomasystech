import { beforeAll, describe, expect, it } from 'vitest';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface SupplyPayload {
  id: string;
  name: string;
  unit: string;
  minQty: number;
  priceCents: number;
  stockQty: number;
  isLowStock: boolean;
  active: boolean;
}

interface StockMovementPayload {
  id: string;
  supplyId: string;
  type: string;
  quantity: number;
  reason: string;
  appointmentId: string | null;
  unitPriceCents: number | null;
  createdAt: string;
}

interface SupplyInsightsPayload {
  bySupply: Array<{
    supplyId: string;
    avgDailyOut: number;
    daysToStockout: number | null;
  }>;
  expiringBatches: Array<{
    batchId: string;
    supplyId: string;
    supplyName: string;
    label: string | null;
    expiresAt: string;
    remaining: number;
    isExpired: boolean;
  }>;
}

describe('Feature: Rotas de estoque (insumos e movimentações)', () => {
  let suppliesRoute: typeof import('@/app/api/supplies/route');
  let supplyByIdRoute: typeof import('@/app/api/supplies/[id]/route');
  let movementsRoute: typeof import('@/app/api/supplies/[id]/movements/route');
  let insightsRoute: typeof import('@/app/api/supplies/insights/route');

  let supplyId: string;

  beforeAll(async () => {
    suppliesRoute = await import('@/app/api/supplies/route');
    supplyByIdRoute = await import('@/app/api/supplies/[id]/route');
    movementsRoute = await import('@/app/api/supplies/[id]/movements/route');
    insightsRoute = await import('@/app/api/supplies/insights/route');
  });

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  it('Dado dados válidos, Quando POST /api/supplies, Então cria insumo', async () => {
    const response = await suppliesRoute.POST(
      jsonRequest('/api/supplies', 'POST', {
        name: 'Bolsa de colostomia',
        unit: 'unidade',
        minQty: 10,
        priceCents: 1500,
      }),
    );
    const body = (await response.json()) as Envelope<SupplyPayload>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Bolsa de colostomia');
    expect(body.data.stockQty).toBe(0);
    expect(body.data.active).toBe(true);
    supplyId = body.data.id;
  });

  it('Dado body sem campos, Quando POST /api/supplies, Então retorna 400 com detalhe zod', async () => {
    const response = await suppliesRoute.POST(
      jsonRequest('/api/supplies', 'POST', {}),
    );
    const body = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(body.error).toContain('Dados inválidos');
  });

  it('Dado insumo criado, Quando GET /api/supplies, Então lista contém o insumo', async () => {
    const response = await suppliesRoute.GET(
      jsonRequest('/api/supplies', 'GET'),
    );
    const body = (await response.json()) as Envelope<SupplyPayload[]>;

    expect(response.status).toBe(200);
    expect(body.data.some((supply) => supply.id === supplyId)).toBe(true);
  });

  it('Dado insumo sem movimentações, Quando GET /api/supplies/:id/movements, Então retorna lista vazia', async () => {
    const response = await movementsRoute.GET(
      jsonRequest(`/api/supplies/${supplyId}/movements`, 'GET'),
      context(supplyId),
    );
    const body = (await response.json()) as Envelope<StockMovementPayload[]>;

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(0);
  });

  it('Dado nome parcial, Quando PUT /api/supplies/:id, Então atualiza somente o campo informado', async () => {
    const response = await supplyByIdRoute.PUT(
      jsonRequest(`/api/supplies/${supplyId}`, 'PUT', {
        name: 'Bolsa de colostomia infantil',
      }),
      context(supplyId),
    );
    const body = (await response.json()) as Envelope<SupplyPayload>;

    expect(response.status).toBe(200);
    expect(body.data.name).toBe('Bolsa de colostomia infantil');
    expect(body.data.unit).toBe('unidade');
    expect(body.data.minQty).toBe(10);
    expect(body.data.priceCents).toBe(1500);
  });

  it('Dado active=false, Quando PUT /api/supplies/:id, Então desativa o insumo', async () => {
    const response = await supplyByIdRoute.PUT(
      jsonRequest(`/api/supplies/${supplyId}`, 'PUT', { active: false }),
      context(supplyId),
    );
    const body = (await response.json()) as Envelope<SupplyPayload>;

    expect(response.status).toBe(200);
    expect(body.data.active).toBe(false);
  });

  it('Dado active=true, Quando PUT /api/supplies/:id, Então reativa o insumo', async () => {
    const response = await supplyByIdRoute.PUT(
      jsonRequest(`/api/supplies/${supplyId}`, 'PUT', { active: true }),
      context(supplyId),
    );
    const body = (await response.json()) as Envelope<SupplyPayload>;

    expect(response.status).toBe(200);
    expect(body.data.active).toBe(true);
  });

  it('Dado id inexistente, Quando PUT /api/supplies/:id, Então retorna 404', async () => {
    const response = await supplyByIdRoute.PUT(
      jsonRequest('/api/supplies/ghost', 'PUT', { name: 'Qualquer' }),
      context('ghost'),
    );

    expect(response.status).toBe(404);
  });

  it('Dado insumo inexistente, Quando POST /api/supplies/:id/movements, Então retorna 404', async () => {
    const response = await movementsRoute.POST(
      jsonRequest('/api/supplies/ghost/movements', 'POST', {
        type: 'in',
        quantity: 5,
        reason: 'Compra inicial',
      }),
      context('ghost'),
    );

    expect(response.status).toBe(404);
  });

  it('Dado tipo inválido, Quando POST /api/supplies/:id/movements, Então retorna 400 zod', async () => {
    const response = await movementsRoute.POST(
      jsonRequest(`/api/supplies/${supplyId}/movements`, 'POST', {
        type: 'invalid',
        quantity: 5,
        reason: 'Motivo qualquer',
      }),
      context(supplyId),
    );
    const body = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(body.error).toContain('Dados inválidos');
  });

  it('Dado entrada de estoque, Quando POST /api/supplies/:id/movements type=in, Então aumenta o saldo', async () => {
    const response = await movementsRoute.POST(
      jsonRequest(`/api/supplies/${supplyId}/movements`, 'POST', {
        type: 'in',
        quantity: 50,
        reason: 'Compra do fornecedor',
      }),
      context(supplyId),
    );
    const body = (await response.json()) as Envelope<SupplyPayload>;

    expect(response.status).toBe(200);
    expect(body.data.stockQty).toBe(50);
  });

  it('Dado saída maior que o saldo, Quando POST /api/supplies/:id/movements type=out, Então retorna 400 (estoque insuficiente)', async () => {
    const response = await movementsRoute.POST(
      jsonRequest(`/api/supplies/${supplyId}/movements`, 'POST', {
        type: 'out',
        quantity: 1_000,
        reason: 'Uso em atendimento',
      }),
      context(supplyId),
    );
    const body = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(body.error).toContain('Estoque insuficiente');
  });

  it('Dado saldo suficiente e consulta inexistente, Quando POST movements type=out com appointmentId, Então retorna 404', async () => {
    const response = await movementsRoute.POST(
      jsonRequest(`/api/supplies/${supplyId}/movements`, 'POST', {
        type: 'out',
        quantity: 10,
        reason: 'Uso em atendimento',
        appointmentId: 'consulta-inexistente',
      }),
      context(supplyId),
    );

    expect(response.status).toBe(404);
  });

  it('Dado insumo com saldo inalterado, Quando GET /api/supplies após tentativas falhas, Então saldo permanece 50', async () => {
    const response = await suppliesRoute.GET(
      jsonRequest('/api/supplies', 'GET'),
    );
    const body = (await response.json()) as Envelope<SupplyPayload[]>;
    const supply = body.data.find((item) => item.id === supplyId);

    expect(supply?.stockQty).toBe(50);
  });

  it('Dado lote com validade, Quando POST movements type=in com batchLabel/expiresAt, Então cria a movimentação com sucesso', async () => {
    const expiresAt = new Date(
      Date.now() + 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const response = await movementsRoute.POST(
      jsonRequest(`/api/supplies/${supplyId}/movements`, 'POST', {
        type: 'in',
        quantity: 20,
        reason: 'Compra com lote',
        batchLabel: 'LOTE-2026-07',
        expiresAt,
      }),
      context(supplyId),
    );
    const body = (await response.json()) as Envelope<SupplyPayload>;

    expect(response.status).toBe(200);
    expect(body.data.stockQty).toBe(70);
  });

  it('Dado insumo com lote a vencer, Quando GET /api/supplies/insights, Então retorna bySupply e expiringBatches', async () => {
    const response = await insightsRoute.GET(
      jsonRequest('/api/supplies/insights', 'GET'),
    );
    const body = (await response.json()) as Envelope<SupplyInsightsPayload>;

    expect(response.status).toBe(200);
    expect(Array.isArray(body.data.bySupply)).toBe(true);
    expect(
      body.data.expiringBatches.some(
        (batch) =>
          batch.supplyId === supplyId && batch.label === 'LOTE-2026-07',
      ),
    ).toBe(true);
  });
});
