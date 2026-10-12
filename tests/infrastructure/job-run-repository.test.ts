import { describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { jobRuns as jobRunsTable } from '@/infrastructure/persistence/drizzle/schema';
import { systemScope } from '@/lib/auth/tenant-scope';

process.env.VITTA_DB_DRIVER = 'pglite';

describe('Feature: última execução dos jobs (#212, OBS-10)', () => {
  it('Dado a migração 0051, Quando lê os lembretes, Então já existe a linha da migração', async () => {
    const { jobRuns } = await getRepositories(systemScope());

    expect(await jobRuns.lastRun('reminders')).toBeInstanceOf(Date);
  });

  it('Dado duas execuções, Quando registra, Então fica a mais recente', async () => {
    const { jobRuns } = await getRepositories(systemScope());

    await jobRuns.recordRun('reminders', new Date('2026-10-10T11:00:00Z'));
    await jobRuns.recordRun('reminders', new Date('2026-10-11T11:00:00Z'));

    expect(await jobRuns.lastRun('reminders')).toEqual(
      new Date('2026-10-11T11:00:00Z'),
    );
  });

  it('Dado nenhuma linha, Quando lê, Então nulo', async () => {
    await (await getDb()).delete(jobRunsTable);
    const { jobRuns } = await getRepositories(systemScope());

    expect(await jobRuns.lastRun('reminders')).toBeNull();
  });
});
