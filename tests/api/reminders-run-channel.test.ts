import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
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

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface RunSummary {
  sent: number;
  skipped: number;
  failed: number;
  clinics: Array<{
    clinicId: string;
    channel?: 'configured' | 'none';
    sent: number;
    skipped: number;
    failed: number;
  }>;
}

const tomorrowAt = (hour: number): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour);
};

const seedTomorrow = async (clinicId: string, email: string) => {
  const repos = await getRepositories(clinicScope(clinicId));
  const patient = Patient.create({
    fullName: `Paciente ${clinicId}`,
    email,
    phone: '(11) 98765-4321',
  });
  await repos.patients.save(patient);
  const startsAt = tomorrowAt(10);
  await repos.appointments.save(
    Appointment.create({
      patientId: patient.id,
      slot: TimeSlot.create(startsAt, new Date(startsAt.getTime() + 3_600_000)),
      procedure: 'Troca de bolsa',
      price: Money.fromCents(25000),
    }),
  );
};

/**
 * C2 (#265): cada clínica envia lembretes pelo próprio canal; clínica sem
 * canal pula, sem cair na conta da plataforma.
 */
describe('Feature: lembretes pelo canal de cada clínica', () => {
  beforeAll(async () => {
    await ensureTestClinics();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(schema.reminderLogs);
    await db.delete(schema.followUps);
    await db.delete(schema.appointments);
    await clearEmailChannels();
    vi.stubEnv('CRON_SECRET', 'cron-secreto');
    vi.stubEnv('APP_URL', 'https://vitta.example.com');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await clearEmailChannels();
  });

  it('canal de cada clínica: A sai pela chave dela, B (sem canal) pula sem log, e o resumo traz o canal por clínica', async () => {
    // A conta da plataforma existe e mesmo assim não é usada pela clínica B.
    vi.stubEnv('RESEND_API_KEY', 're_chave_plataforma');
    vi.stubEnv('EMAIL_FROM', 'Vitta <nao-responda@vitta.app>');
    await saveEmailChannel(CLINIC_A_ID, 're_chave_da_A');
    await seedTomorrow(CLINIC_A_ID, 'paciente.a@example.com');
    await seedTomorrow(CLINIC_B_ID, 'paciente.b@example.com');
    const fetchMock = stubProviderFetch(200);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const route = await import('@/app/api/reminders/run/route');
    const response = await route.POST(
      jsonRequest('/api/reminders/run', 'POST', undefined, {
        'x-cron-secret': 'cron-secreto',
      }),
    );
    const body = (await response.json()) as Envelope<RunSummary>;

    expect(response.status).toBe(200);
    expect(providerCalls(fetchMock)).toEqual([
      expect.objectContaining({
        auth: 'Bearer re_chave_da_A',
        to: 'paciente.a@example.com',
      }),
    ]);
    const entry = (id: string) =>
      body.data.clinics.find((c) => c.clinicId === id);
    expect(entry(CLINIC_A_ID)).toMatchObject({
      channel: 'configured',
      sent: 1,
    });
    expect(entry(CLINIC_B_ID)).toMatchObject({
      channel: 'none',
      sent: 0,
      skipped: 1,
    });
    expect(body.data).not.toHaveProperty('channelEnabled');
    const logs = await (await getDb()).select().from(schema.reminderLogs);
    expect(logs.filter((log) => log.clinicId === CLINIC_B_ID)).toHaveLength(0);
    expect(logs.filter((log) => log.clinicId === CLINIC_A_ID)).toHaveLength(1);
  });
});
