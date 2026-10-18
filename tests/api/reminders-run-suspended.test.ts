import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CreatePatient } from '@/application/patients/create-patient';
import { Clinic } from '@/domain/clinic/clinic';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { spyOnSentEmails } from '../support/email';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const CLINIC_ID = 'rem-suspensa';
const PATIENT_EMAIL = 'paciente-suspensa@example.com';

interface Envelope<T> {
  success: boolean;
  data: T;
}

async function runJob() {
  const route = await import('@/app/api/reminders/run/route');
  const response = await route.POST(
    jsonRequest('/api/reminders/run', 'POST', undefined, {
      'x-cron-secret': 'cron-secreto',
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Envelope<{
    clinics: { clinicId: string }[];
  }>;
}

async function setStatus(suspended: boolean) {
  const { clinics } = await getRepositories(systemScope());
  const clinic = (await clinics.findById(CLINIC_ID)) as Clinic;
  await clinics.saveStatus(
    suspended
      ? clinic.suspend('root@estomasystech.test', new Date(), {
          reason: 'other',
        })
      : clinic.reactivate('root@estomasystech.test', new Date()),
  );
}

describe('Feature: Job de lembretes ignora clínica suspensa (B5, rota)', () => {
  beforeAll(async () => {
    const { clinics } = await getRepositories(systemScope());
    await clinics.create(
      Clinic.restore({
        id: CLINIC_ID,
        name: 'Clínica Suspensa',
        createdBy: 'fixture',
        createdAt: new Date(),
      }),
    );
    const services = await getRepositories(clinicScope(CLINIC_ID));
    const patient = await new CreatePatient(services.patients).execute({
      fullName: 'Paciente Suspensa',
      email: PATIENT_EMAIL,
      phone: '11999990000',
    });
    // Consulta daqui a 24 h: é "amanhã" no fuso da aplicação.
    const start = new Date(Date.now() + 24 * 3_600_000);
    await services.appointments.save(
      Appointment.create({
        patientId: patient.id,
        slot: TimeSlot.create(start, new Date(start.getTime() + 3_600_000)),
        procedure: 'Troca de bolsa',
        price: Money.fromCents(10000),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('Dada clínica suspensa com consulta amanhã, Quando o job roda, Então nenhum e-mail sai para ela; reativada, o próximo disparo a processa', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secreto');
    const emails = spyOnSentEmails();
    await setStatus(true);

    const suspended = await runJob();
    expect(suspended.data.clinics.map((c) => c.clinicId)).not.toContain(
      CLINIC_ID,
    );
    expect(emails.bodies.some((b) => b.startsWith(PATIENT_EMAIL))).toBe(false);

    await setStatus(false);
    const reactivated = await runJob();
    expect(reactivated.data.clinics.map((c) => c.clinicId)).toContain(
      CLINIC_ID,
    );
    expect(emails.bodies.some((b) => b.startsWith(PATIENT_EMAIL))).toBe(true);
    emails.restore();
  });
});
