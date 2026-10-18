import { NextRequest } from 'next/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { recordSignal, resetSignals } from '@/lib/observability/signals';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Body {
  success: boolean;
  data: {
    channel: string;
    checks: { key: string; firing: boolean; notified: boolean }[];
  };
}

const post = async (headers: Record<string, string> = {}) => {
  const route = await import('@/app/api/alerts/run/route');
  return route.POST(
    new NextRequest('http://localhost/api/alerts/run', {
      method: 'POST',
      headers,
    }),
  );
};

const get = async (headers: Record<string, string> = {}) => {
  const route = await import('@/app/api/alerts/run/route');
  return route.GET(
    new NextRequest('http://localhost/api/alerts/run', { headers }),
  );
};

describe('Feature: rota do cron de alertas (#212, OBS-11, OBS-13)', () => {
  // Abre o PGlite antes: o primeiro getDb() do arquivo carrega o snapshot e,
  // sob carga, comeria o prazo de 3 s da readiness.
  beforeAll(async () => {
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    await getDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetSignals();
  });

  it('Dado sem CRON_SECRET, Quando chama, Então 503', async () => {
    vi.stubEnv('CRON_SECRET', '');

    expect((await post({ 'x-cron-secret': 'x' })).status).toBe(503);
  });

  it('Dado segredo errado ou ausente, Quando chama, Então 401', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron-123');

    expect((await post()).status).toBe(401);
    expect((await get({ authorization: 'Bearer outro' })).status).toBe(401);
    expect((await get({ authorization: 'Basic x' })).status).toBe(401);
  });

  it('Dado 5xx acima do limiar e sem canal da plataforma, Quando roda, Então responde o resumo com canal none', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron-123');
    vi.stubEnv('ALERT_EMAIL_TO', 'operador@estomasystech.test');
    vi.stubEnv('ALERT_5XX_THRESHOLD', '2');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    recordSignal('server-error');
    recordSignal('server-error');

    const response = await post({ 'x-cron-secret': 'segredo-do-cron-123' });
    const body = (await response.json()) as Body;

    expect(response.status).toBe(200);
    expect(body.data.channel).toBe('none');
    expect(body.data.checks.map((c) => [c.key, c.firing, c.notified])).toEqual([
      ['readiness', false, false],
      ['server-errors', true, false],
      ['reminders-stale', false, false],
      ['delivery-failures', false, false],
    ]);
    expect(log).toHaveBeenCalled();
  });

  it('Dado Bearer do Vercel Cron, Quando roda com tudo saudável, Então 200', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron-123');

    const response = await get({
      authorization: 'Bearer segredo-do-cron-123',
    });
    const body = (await response.json()) as Body;

    expect(response.status).toBe(200);
    expect(body.data.checks.some((c) => c.firing)).toBe(false);
  });
});
