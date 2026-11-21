import { beforeAll, describe, expect, it } from 'vitest';
import { ClinicNursingDiagnosis } from '@/domain/taxonomy/clinic-nursing-diagnosis';
import { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import { getRepositories } from '@/infrastructure/container';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: rotas da SAE com o catálogo da clínica e o diagnóstico sem código (#954)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientCarePlansRoute: typeof import('@/app/api/patients/[id]/care-plans/route');
  let carePlanByIdRoute: typeof import('@/app/api/care-plans/[id]/route');
  let diagnosesRoute: typeof import('@/app/api/care-plans/[id]/diagnoses/route');
  let clinicSearchRoute: typeof import('@/app/api/taxonomy/clinic-diagnoses/route');
  let carePlanId: string;
  let clinicEntry: ClinicNursingDiagnosis;

  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const pes = {
    type: 'real',
    relatedFactors: 'Efluente em contato com a pele',
    definingCharacteristics: 'Eritema periestomal',
  };

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
    patientCarePlansRoute = await import(
      '@/app/api/patients/[id]/care-plans/route'
    );
    carePlanByIdRoute = await import('@/app/api/care-plans/[id]/route');
    diagnosesRoute = await import('@/app/api/care-plans/[id]/diagnoses/route');
    clinicSearchRoute = await import(
      '@/app/api/taxonomy/clinic-diagnoses/route'
    );

    const { nursingDiagnoses } = await getRepositories(systemScope());
    await nursingDiagnoses.save(
      NursingDiagnosis.create({
        code: '00046',
        label: 'Integridade da pele prejudicada',
        domain: 'Domínio 11',
        class: 'Classe 2',
        edition: 'NANDA-I 2021-2023',
      }),
    );
    const { clinicDiagnoses } = await getRepositories(
      clinicScope(LEGACY_CLINIC_ID),
    );
    clinicEntry = ClinicNursingDiagnosis.create({
      clinicId: LEGACY_CLINIC_ID,
      code: '00312',
      label: 'Lesão por pressão no adulto',
    });
    await clinicDiagnoses.save(clinicEntry);

    const patient = (await (
      await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Rita Lopes',
          email: 'rita.954@example.com',
          phone: '11988880954',
        }),
      )
    ).json()) as Envelope<{ id: string }>;
    const plan = (await (
      await patientCarePlansRoute.POST(
        jsonRequest(`/api/patients/${patient.data.id}/care-plans`, 'POST', {}),
        context(patient.data.id),
      )
    ).json()) as Envelope<{ id: string }>;
    carePlanId = plan.data.id;
  });

  const post = (body: Record<string, unknown>) =>
    diagnosesRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/diagnoses`, 'POST', body),
      context(carePlanId),
    );

  it('Dado termo, Quando buscar no catálogo da clínica, Então traz o item da empresa da sessão', async () => {
    const response = await clinicSearchRoute.GET(
      jsonRequest('/api/taxonomy/clinic-diagnoses?q=press%C3%A3o', 'GET'),
    );
    const body = (await response.json()) as Envelope<
      { id: string; code: string }[]
    >;
    expect(body.data).toEqual([
      expect.objectContaining({
        id: clinicEntry.id,
        code: '00312',
        active: true,
      }),
    ]);
  });

  it('Dado pedido sem sessão, Quando buscar no catálogo da clínica, Então responde 401', async () => {
    const response = await clinicSearchRoute.GET(
      jsonRequest('/api/taxonomy/clinic-diagnoses', 'GET', undefined, {
        cookie: '',
      }),
    );
    expect(response.status).toBe(401);
  });

  it('Dado item da clínica e diagnóstico digitado, Quando prescrever e ler o plano, Então mostram o título gravado e o "sem código"', async () => {
    const fromClinic = (await (
      await post({ clinicDiagnosisId: clinicEntry.id, ...pes })
    ).json()) as Envelope<{ diagnosisCode: string; diagnosisLabel: string }>;
    expect(fromClinic.data).toMatchObject({
      diagnosisCode: '00312',
      diagnosisLabel: 'Lesão por pressão no adulto',
    });

    const typed = (await (
      await post({ diagnosisLabel: 'Pele periestomal irritada', ...pes })
    ).json()) as Envelope<{
      diagnosisCode: string | null;
      diagnosisLabel: string;
    }>;
    expect(typed.data).toMatchObject({
      diagnosisCode: null,
      diagnosisLabel: 'Pele periestomal irritada',
    });

    const global = (await (
      await post({ diagnosisCode: '00046', ...pes })
    ).json()) as Envelope<{
      diagnosisLabel: string;
    }>;
    expect(global.data.diagnosisLabel).toBe('Integridade da pele prejudicada');

    const detail = (await (
      await carePlanByIdRoute.GET(
        jsonRequest(`/api/care-plans/${carePlanId}`, 'GET'),
        context(carePlanId),
      )
    ).json()) as Envelope<{
      diagnoses: { diagnosisCode: string | null; diagnosisLabel: string }[];
    }>;
    expect(
      detail.data.diagnoses
        .map((d) => [d.diagnosisCode, d.diagnosisLabel])
        .sort(),
    ).toEqual(
      [
        ['00046', 'Integridade da pele prejudicada'],
        ['00312', 'Lesão por pressão no adulto'],
        [null, 'Pele periestomal irritada'],
      ].sort(),
    );
  });

  it('Dado duas origens no mesmo pedido, Quando prescrever, Então recusa', async () => {
    const response = await post({
      diagnosisCode: '00046',
      diagnosisLabel: 'Pele irritada',
      ...pes,
    });
    expect(response.status).toBe(400);
  });
});
