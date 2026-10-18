import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/**
 * Issue #187: a constraint `appointments_no_overlap` não tinha `clinic_id`,
 * então consulta sem profissional numa empresa bloqueava o mesmo horário em
 * todas as outras (409 entre tenants + canal lateral).
 */
describe('Feature: Conflito de agenda por empresa (#187)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let patientA: string;
  let patientA2: string;
  let patientB: string;

  const createPatient = async (clinicId: string, email: string) => {
    const response = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName: 'Paciente Overlap', email, phone: '11999990000' },
        adminCookieHeader(clinicId),
      ),
    );
    return ((await response.json()) as Envelope<{ id: string }>).data.id;
  };

  const schedule = (
    clinicId: string,
    patientId: string,
    startsAt: string,
    endsAt: string,
  ) =>
    appointmentsRoute.POST(
      jsonRequest(
        '/api/appointments',
        'POST',
        {
          patientId,
          startsAt,
          endsAt,
          procedure: 'Troca de bolsa',
          priceCents: 15000,
        },
        adminCookieHeader(clinicId),
      ),
    );

  beforeAll(async () => {
    await ensureTestClinics();
    patientsRoute = await import('@/app/api/patients/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    patientA = await createPatient(CLINIC_A_ID, 'overlap-a@x.com');
    patientA2 = await createPatient(CLINIC_A_ID, 'overlap-a2@x.com');
    patientB = await createPatient(CLINIC_B_ID, 'overlap-b@x.com');
  });

  it('C1 mesmo horário sem profissional em duas empresas: ambas 200', async () => {
    const first = await schedule(
      CLINIC_A_ID,
      patientA,
      '2027-06-08T13:00:00.000Z',
      '2027-06-08T14:00:00.000Z',
    );
    const second = await schedule(
      CLINIC_B_ID,
      patientB,
      '2027-06-08T13:00:00.000Z',
      '2027-06-08T14:00:00.000Z',
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('C2 mesmo horário sem profissional na mesma empresa: 409', async () => {
    const first = await schedule(
      CLINIC_A_ID,
      patientA,
      '2027-06-09T13:00:00.000Z',
      '2027-06-09T14:00:00.000Z',
    );
    const second = await schedule(
      CLINIC_A_ID,
      patientA2,
      '2027-06-09T13:00:00.000Z',
      '2027-06-09T14:00:00.000Z',
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it('C3 constraint do banco aceita o mesmo horário em outra empresa', async () => {
    const db = await getDb();
    const insert = (id: string, clinicId: string, patientId: string) =>
      db.execute(sql`
        INSERT INTO appointments
          (id, clinic_id, patient_id, starts_at, ends_at, procedure, price_cents, status, created_at)
        VALUES
          (${id}, ${clinicId}, ${patientId}, '2027-06-10T13:00:00Z',
           '2027-06-10T14:00:00Z', 'Troca de bolsa', 15000, 'scheduled', now())
      `);

    await insert('overlap-raw-a', CLINIC_A_ID, patientA);
    await expect(
      insert('overlap-raw-b', CLINIC_B_ID, patientB),
    ).resolves.toBeDefined();
    // Mesma empresa, mesmo horário: a exclusão do banco rejeita (23P01).
    await expect(
      insert('overlap-raw-a2', CLINIC_A_ID, patientA2),
    ).rejects.toMatchObject({
      cause: { code: '23P01', constraint: 'appointments_no_overlap' },
    });
  });
});
