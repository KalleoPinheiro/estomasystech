import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.VITTA_DB_DRIVER = 'pglite';

describe('Feature: health check (#212, OBS-01, OBS-02)', () => {
  afterEach(() => {
    vi.doUnmock('@/infrastructure/persistence/drizzle/readiness');
    vi.resetModules();
  });

  it('Dado o processo no ar, Quando GET /api/health, Então 200 sem tocar o banco', async () => {
    const { GET } = await import('@/app/api/health/route');

    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { status: 'ok' },
      error: null,
    });
  });

  it('Dado banco migrado, Quando GET /api/health/ready, Então 200 com as duas checagens ok', async () => {
    const { GET } = await import('@/app/api/health/ready/route');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { database: 'ok', migrations: 'ok' },
      error: null,
    });
  });

  it('Dado banco fora, Quando GET /api/health/ready, Então 503 sem detalhe do erro', async () => {
    vi.resetModules();
    vi.doMock('@/infrastructure/persistence/drizzle/readiness', () => ({
      checkReadiness: async () => ({
        ready: false,
        database: 'fail',
        migrations: 'unknown',
      }),
    }));
    const { GET } = await import('@/app/api/health/ready/route');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      data: { database: 'fail', migrations: 'unknown' },
      error: 'Serviço indisponível',
    });
  });
});
