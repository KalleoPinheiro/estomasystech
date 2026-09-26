import { beforeAll, describe, expect, it } from 'vitest';
import { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';
import { getRepositories } from '@/infrastructure/container';
import { systemScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/**
 * Issue #200: abertura do plano, execução de intervenção e avaliação de
 * resultado aceitavam `professionalId` do corpo (autoria forjável, mesma
 * classe da #64). A autoria agora é sempre a da sessão.
 */
describe('Feature: autoria do plano de cuidados pela sessão (#200)', () => {
  let drA: string;
  let drB: string;
  let asDrA: Record<string, string>;
  let patientId: string;
  let carePlanId: string;
  let interventionId: string;
  let outcomeId: string;

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  const createProfessional = async (fullName: string) => {
    const route = await import('@/app/api/professionals/route');
    const response = await route.POST(
      jsonRequest(
        '/api/professionals',
        'POST',
        { fullName },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    return ((await response.json()) as Envelope<{ id: string }>).data.id;
  };

  beforeAll(async () => {
    await ensureTestClinics();
    const { nursingOutcomes, nursingInterventions } = await getRepositories(
      systemScope(),
    );
    await nursingOutcomes.save(
      NursingOutcome.create({
        code: '1101',
        label: 'Integridade tissular: pele e mucosas',
        domain: 'Saúde fisiológica',
        class: 'Integridade tissular',
        edition: 'NOC 6ª ed.',
        scaleAnchors: ['1', '2', '3', '4', '5'],
      }),
    );
    await nursingInterventions.save(
      NursingIntervention.create({
        code: '3660',
        label: 'Cuidados com lesões',
        domain: 'Fisiológico: básico',
        class: 'Controle de pele/lesão',
        edition: 'NIC 7ª ed.',
      }),
    );
    drA = await createProfessional('Dra. A — Autoria SAE');
    drB = await createProfessional('Dr. B — Autoria SAE');
    asDrA = cookieHeaderFor('profissional', `${drA}@x.com`, CLINIC_A_ID, drA);

    const patientsRoute = await import('@/app/api/patients/route');
    const patient = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        {
          fullName: 'Paciente Autoria SAE',
          email: 'autoria-sae@x.com',
          phone: '11999990000',
        },
        asDrA,
      ),
    );
    patientId = ((await patient.json()) as Envelope<{ id: string }>).data.id;
  });

  it('C17 abertura do plano usa o profissional da sessão', async () => {
    const route = await import('@/app/api/patients/[id]/care-plans/route');
    const response = await route.POST(
      jsonRequest(
        `/api/patients/${patientId}/care-plans`,
        'POST',
        { professionalId: drB },
        asDrA,
      ),
      context(patientId),
    );
    const body = (await response.json()) as Envelope<{
      id: string;
      professionalId: string | null;
    }>;

    expect(response.status).toBe(200);
    expect(body.data.professionalId).toBe(drA);
    carePlanId = body.data.id;

    const interventions = await import(
      '@/app/api/care-plans/[id]/interventions/route'
    );
    const intervention = await interventions.POST(
      jsonRequest(
        `/api/care-plans/${carePlanId}/interventions`,
        'POST',
        {
          interventionCode: '3660',
          frequency: 'A cada troca',
          priority: 'alta',
        },
        asDrA,
      ),
      context(carePlanId),
    );
    interventionId = ((await intervention.json()) as Envelope<{ id: string }>)
      .data.id;

    const outcomes = await import('@/app/api/care-plans/[id]/outcomes/route');
    const outcome = await outcomes.POST(
      jsonRequest(
        `/api/care-plans/${carePlanId}/outcomes`,
        'POST',
        { outcomeCode: '1101', baselineScore: 2, targetScore: 4 },
        asDrA,
      ),
      context(carePlanId),
    );
    outcomeId = ((await outcome.json()) as Envelope<{ id: string }>).data.id;
  });

  it('C18 execução de intervenção usa o profissional da sessão', async () => {
    expect(interventionId).toBeTruthy();
    const route = await import(
      '@/app/api/care-plan-interventions/[id]/records/route'
    );
    const response = await route.POST(
      jsonRequest(
        `/api/care-plan-interventions/${interventionId}/records`,
        'POST',
        { professionalId: drB, notes: 'Troca realizada' },
        asDrA,
      ),
      context(interventionId),
    );
    const body = (await response.json()) as Envelope<{
      professionalId: string | null;
    }>;

    expect(response.status).toBe(200);
    expect(body.data.professionalId).toBe(drA);
  });

  it('C19 avaliação de resultado usa o profissional da sessão', async () => {
    expect(outcomeId).toBeTruthy();
    const route = await import(
      '@/app/api/care-plan-outcomes/[id]/evaluations/route'
    );
    const response = await route.POST(
      jsonRequest(
        `/api/care-plan-outcomes/${outcomeId}/evaluations`,
        'POST',
        { score: 3, professionalId: drB },
        asDrA,
      ),
      context(outcomeId),
    );
    const body = (await response.json()) as Envelope<{
      professionalId: string | null;
    }>;

    expect(response.status).toBe(200);
    expect(body.data.professionalId).toBe(drA);
  });

  it('Admin sem profissional vinculado grava sem autoria, nunca a do corpo', async () => {
    const route = await import(
      '@/app/api/care-plan-outcomes/[id]/evaluations/route'
    );
    const response = await route.POST(
      jsonRequest(
        `/api/care-plan-outcomes/${outcomeId}/evaluations`,
        'POST',
        { score: 4, professionalId: drB },
        adminCookieHeader(CLINIC_A_ID),
      ),
      context(outcomeId),
    );
    const body = (await response.json()) as Envelope<{
      professionalId: string | null;
    }>;

    expect(response.status).toBe(200);
    expect(body.data.professionalId).toBeNull();
  });
});
