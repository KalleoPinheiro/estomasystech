import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { DataSubjectRequest } from '@/domain/patient/data-subject-request';
import { Patient } from '@/domain/patient/patient';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import {
  clearEmailChannels,
  providerCalls,
  saveEmailChannel,
  stubProviderFetch,
} from '../support/email-channel';
import { jsonRequest } from '../support/request';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Summary {
  dataRequestDeadlines: { alerted: number; skipped: number; failed: number };
}

const DAY = 86_400_000;

async function seedOverdueRequest(clinicId: string, adminEmail: string) {
  const repos = await getRepositories(clinicScope(clinicId));
  const patient = Patient.create({
    fullName: `Titular ${clinicId}`,
    email: `titular-${clinicId}@example.com`,
    phone: '11999990000',
  });
  await repos.patients.save(patient);
  await repos.userAccounts.save(
    UserAccount.create({
      email: adminEmail,
      passwordHash: UNSET_PASSWORD_HASH,
      role: 'company_admin',
      clinicId,
    }),
  );
  const request = DataSubjectRequest.create(
    {
      patientId: patient.id,
      kind: 'correction',
      details: 'Texto sigiloso do pedido',
    },
    new Date(Date.now() - 14 * DAY), // vence amanhã
  );
  await repos.dataSubjectRequests.save(request);
  return { repos, request };
}

const runCron = async () => {
  const route = await import('@/app/api/reminders/run/route');
  const response = await route.POST(
    jsonRequest('/api/reminders/run', 'POST', undefined, {
      'x-cron-secret': 'cron-secreto',
    }),
  );
  return {
    response,
    body: (await response.json()) as { data: Summary },
  };
};

/** #312: o job diário avisa o Admin dos pedidos do titular perto do prazo, pelo canal da clínica. */
describe('Feature: aviso de prazo dos pedidos do titular no cron diário (#312)', () => {
  beforeAll(async () => {
    await ensureTestClinics();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(schema.dataSubjectRequests);
    await clearEmailChannels();
    vi.stubEnv('CRON_SECRET', 'cron-secreto');
    vi.stubEnv('APP_URL', 'https://vitta.example.com');
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await clearEmailChannels();
  });

  it('clínica com canal avisa o Admin uma vez (sem o texto do pedido); sem canal pula e não marca', async () => {
    await saveEmailChannel(CLINIC_A_ID, 're_chave_da_A');
    const a = await seedOverdueRequest(CLINIC_A_ID, 'admin-a@example.com');
    const b = await seedOverdueRequest(CLINIC_B_ID, 'admin-b@example.com');
    const fetchMock = stubProviderFetch(200);

    const first = await runCron();
    const second = await runCron();

    expect(first.response.status).toBe(200);
    expect(first.body.data.dataRequestDeadlines).toEqual({
      alerted: 1,
      skipped: 1,
      failed: 0,
    });
    const calls = providerCalls(fetchMock);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      auth: 'Bearer re_chave_da_A',
      to: 'admin-a@example.com',
    });
    expect(calls[0]?.text).toContain(
      'https://vitta.example.com/pedidos-titular',
    );
    expect(calls[0]?.text).not.toContain('sigiloso');
    // Segunda execução: A já foi avisada; B segue pulada.
    expect(second.body.data.dataRequestDeadlines).toEqual({
      alerted: 0,
      skipped: 1,
      failed: 0,
    });
    expect(
      (await a.repos.dataSubjectRequests.findById(a.request.id))
        ?.deadlineAlertedAt,
    ).not.toBeNull();
    expect(
      (await b.repos.dataSubjectRequests.findById(b.request.id))
        ?.deadlineAlertedAt,
    ).toBeNull();
  });
});
