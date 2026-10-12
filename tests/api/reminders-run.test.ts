import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.VITTA_DB_DRIVER = 'pglite';

const get = async (headers: Record<string, string> = {}) => {
  const route = await import('@/app/api/reminders/run/route');
  return route.GET(
    new NextRequest('http://localhost/api/reminders/run', { headers }),
  );
};

describe('Feature: Vercel Cron dispara o job de lembretes (#206)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('vercel cron bearer: GET sem Bearer ou com segredo errado → 401; com Bearer $CRON_SECRET executa', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron-123');

    expect((await get()).status).toBe(401);
    expect((await get({ authorization: 'Bearer outro-segredo' })).status).toBe(
      401,
    );
    // O cabeçalho do POST não vale no GET, e vice-versa.
    expect((await get({ 'x-cron-secret': 'segredo-do-cron-123' })).status).toBe(
      401,
    );

    const response = await get({
      authorization: 'Bearer segredo-do-cron-123',
    });
    const body = (await response.json()) as { success: boolean };
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('sem CRON_SECRET o GET também fica desativado (503)', async () => {
    vi.stubEnv('CRON_SECRET', '');

    expect((await get({ authorization: 'Bearer qualquer' })).status).toBe(503);
  });

  it('Dado execução concluída, Quando termina, Então registra a hora em job_runs (#212, OBS-10)', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron-123');
    const { getRepositories } = await import('@/infrastructure/container');
    const { systemScope } = await import('@/lib/auth/tenant-scope');
    const { jobRuns } = await getRepositories(systemScope());
    await jobRuns.recordRun('reminders', new Date('2020-01-01T00:00:00Z'));
    const before = Date.now();

    await get({ authorization: 'Bearer segredo-do-cron-123' });

    const last = await jobRuns.lastRun('reminders');
    expect(last?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('Dado falha ao registrar a execução, Quando termina, Então a resposta não muda (#212)', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron-123');
    const { DrizzleJobRunRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-job-run-repository'
    );
    vi.spyOn(DrizzleJobRunRepository.prototype, 'recordRun').mockRejectedValue(
      new Error('banco fora'),
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await get({ authorization: 'Bearer segredo-do-cron-123' });

    expect(response.status).toBe(200);
    expect(
      log.mock.calls.some(([line]) =>
        String(line).includes('Lembretes: falha ao registrar a execução'),
      ),
    ).toBe(true);
    vi.restoreAllMocks();
  });
});
