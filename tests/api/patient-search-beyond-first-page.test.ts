import { beforeAll, describe, expect, it } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID } from '../support/clinics';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/**
 * Issue #197: os seletores usavam a 1ª página de `/api/patients` (100 em
 * ordem alfabética) como lista completa — o 101º paciente em diante não
 * podia ser agendado. A seleção agora busca por `search`.
 */
describe('Feature: paciente além da 1ª página é selecionável (#197)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    const { patients } = await getRepositories(clinicScope(CLINIC_A_ID));
    for (let i = 1; i <= 150; i++) {
      const n = String(i).padStart(3, '0');
      await patients.save(
        Patient.create({
          fullName: `Paciente Volume ${n}`,
          email: `volume-${n}@x.com`,
          phone: '11999990000',
        }),
      );
    }
  });

  it('C33 paciente 150 é encontrado pela busca e agendado', async () => {
    const firstPage = await patientsRoute.GET(
      jsonRequest('/api/patients', 'GET'),
    );
    const firstNames = (
      (await firstPage.json()) as Envelope<{ fullName: string }[]>
    ).data.map((p) => p.fullName);
    expect(firstNames).toHaveLength(100);
    expect(firstNames).not.toContain('Paciente Volume 150');

    const search = await patientsRoute.GET(
      jsonRequest('/api/patients?search=Volume%20150&limit=20', 'GET'),
    );
    const found = (
      (await search.json()) as Envelope<{ id: string; fullName: string }[]>
    ).data;
    const target = found.find((p) => p.fullName === 'Paciente Volume 150');
    expect(target).toBeDefined();

    const scheduled = await appointmentsRoute.POST(
      jsonRequest('/api/appointments', 'POST', {
        patientId: target?.id,
        startsAt: '2027-06-15T13:00:00.000Z',
        endsAt: '2027-06-15T14:00:00.000Z',
        procedure: 'Curativo',
        priceCents: 10000,
      }),
    );
    expect(scheduled.status).toBe(200);
  });
});
