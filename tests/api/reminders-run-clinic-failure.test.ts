import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';

process.env.VITTA_DB_DRIVER = 'pglite';

// A leitura da empresa B lança; o resto do container é o real.
vi.mock('@/infrastructure/container', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/infrastructure/container')>();
  return {
    ...actual,
    getRepositories: async (
      scope: Parameters<typeof actual.getRepositories>[0],
    ) => {
      if (scope.clinicId === 'test-clinic-b') {
        throw new Error('banco indisponível para a empresa B');
      }
      return actual.getRepositories(scope);
    },
  };
});

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Job de lembretes com falha em uma empresa (rota)', () => {
  beforeAll(async () => {
    await ensureTestClinics();
  });

  it('C10 resposta traz a empresa que falhou com error e contadores zerados', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secreto');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = await import('@/app/api/reminders/run/route');

    const response = await route.POST(
      jsonRequest('/api/reminders/run', 'POST', undefined, {
        'x-cron-secret': 'cron-secreto',
      }),
    );
    const body = (await response.json()) as Envelope<{
      clinics: Array<Record<string, unknown>>;
    }>;

    expect(response.status).toBe(200);
    expect(body.data.clinics.find((c) => c.clinicId === CLINIC_B_ID)).toEqual({
      clinicId: CLINIC_B_ID,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: 'banco indisponível para a empresa B',
    });
    const entryA = body.data.clinics.find((c) => c.clinicId === CLINIC_A_ID);
    expect(entryA).toBeDefined();
    expect(entryA).not.toHaveProperty('error');
    vi.unstubAllEnvs();
  });
});
